#!/usr/bin/env node

/*
 * This file makes it possible to fix an error in Dafny in no time.
 * Add the following alias in your bash profile:
 * 
 * alias fix='node scripts/fix-dafny-issue.js'
 * 
 * First usage
 * 
 * > fix [<issueNumber> [<issueKeyword>]]
 * 
 * This script will automate for you and ask questions as appropriate to
 * - Ask you for the issue number and issue keyword if not provided
 * - Fetch the reproducing code of the issue
 * - Create Test/git-issues/git-issue-<issueNumber>.dfy and Test/git-issues/git-issue-<issueNumber>.dfy.expect
 *   ensuring it contains a header that LIT can parse, considering the possibility that it needs to be run
 * - Open these two files in their default editor.
 * - Create a branch named fix-<issueNumber>-<issueKeyword>, and commit the files there immediately
 * - Provide you information to debug the issue in Rider, in CLI dotnet, or just run Dafny.
 * 
 * For an issue that already exists, the command above (with optional issueNumber if it's the same)
 * - Compile and run the tests
 * - If the tests pass, it asks you if you want to commit the changes.
 *   If you accept:
 * - Create the doc/dev/news/<issueNumber>.fix file for you
 *   (if it did not exist)
 * - Add all new and modified files
 *   (including other git-issue-<issueNumber><suffix>.dfy files) 
 * - Push the changes
 * - If the first time it's pushed, open your browser with a page
 *   to create the PR with the title and description already populated.
 * 
 * If you want to switch to another issue that you already initiated,
 * ensure the working directory is clean, and run
 * 
 * fix <existing issue number | pr number | keyword>
 * 
 * That will result in
 * - Checking out the branch with the matching issue
 * - Opening the test files in their respective editors
 * - Rebuilding the solution
 * - Providing you with information on how to test the issue.
 * 
 * If you are already in the issue branch but you want to open
 * the test files, just write 
 * 
 * > fix open
 * 
 * If you want to do the publishing without runnning the tests,
 * but only write a commit message, just write
 * 
 * > fix force
 * 
 * If you want to add and open a new test case for the same issue
 * (e.g. Test/git-issues/git-issue-<issueNumber>b.dfy), run
 * 
 * > fix more <optional existing issue # or existing test name>
 * 
 * If you just write `fix more`, you will be prompted for the argument.
 * - Providing a number will let you import another GitHub issue.
 * - Providing a an existing test name pattern will ensure that all these
 *   selected tests are run when you run `fix` without arguments.
 */

if(process.cwd().endsWith("scripts")) {
  process.chdir("..");
}

const ABORTED = "ABORTED";
const ACCEPT_HINT = "(ENTER or y for yes, n for no, CTRL+C to abort) ";
const { exit } = require('process');
const readline = require('readline');
const root = require('child_process').execSync('npm root -g').toString().trim();
const fs = require('fs');
let fetch = null;
try {
  fetch = require(root + '/cross-fetch');
} catch(e) {
  console.log("cross-fetch must be installed globally. Run `npm install -g cross-fetch`");
  exit(1);
}
let open = null;
try {
  open = require(root + '/open')
} catch(e) {
  console.log("open must be installed globally. Run `npm install -g open`");
  exit(1);
}
const { promisify } = require('util');
const exec = require('child_process').exec;
const execAsync = promisify(exec);
async function execLog(cmd, hint, returnAbortedIfFailure=true) {
  console.log(hint);
  var output = "";
  try {
    output = await execAsync(cmd);
  } catch(e) {
    if(returnAbortedIfFailure) {
      console.log(e);
      return ABORTED;
    } else {
      return e;
    }
  }
  return output;
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
function close() {
  rl.close();
  return false;
}
// Ask the given question and returns the answer of the user
const question = function(input) {
  return new Promise((resolve, reject) => {
    rl.question(input, resolve);
  });
}
// Returns true iff there is no pending changes on the current branch
async function ensureWorkingDirectoryClean() {
  var unstagedChanges = (await execAsync("git diff")).stdout.trim() + (await execAsync("git diff --cached")).stdout.trim();
  if(unstagedChanges != "") {
    return false;//console.log("Please commit your changes before launching this script.");
  }
  return true;
}
// Returns true if the answer can be interpreted as a "yes"
function ok(answer) {
  return answer.toLowerCase() == "y" || answer == "";
}
// Same as question(), but only accepts the answers in the array acceptableAnswers
async function filterQuestion(prompt, acceptableAnswers) {
  var answer = await question(prompt);
  if(acceptableAnswers.indexOf(answer) == -1) {
    console.log("Invalid answer. Please try again.");
    return filter(prompt, acceptableAnswers);
  }
  return answer;
}
// Returns the name of the current branch
async function getCurrentBranch() {
  return (await execAsync("git branch --show-current")).stdout.trim();
}
// If we are on "master", ensures the working directory is clean and pull the latest master
// If we are on a branch,
// - If it's a fix branch, returns the parsed issue number and keyword
// - If it's not a fix branch, try to check out master
async function ensureMasterOrFollowupFix(providedIssueNumber, addOneTestCase) {
  var cleanDirectory = await ensureWorkingDirectoryClean();
  var currentBranch = await getCurrentBranch();
  if(currentBranch != "master") {
    // If the branch is named fix-XXXX-YYYY, then we extract the issue and keyword and we return them
    var match = currentBranch.match(/^fix-(\d+)-(.+)$/);
    var currentBranchMatchesProvidedIssueNumber = addOneTestCase || (match && (providedIssueNumber == null || currentBranch.match(new RegExp(`^fix-.*${providedIssueNumber}.*\$`))));
    if(currentBranchMatchesProvidedIssueNumber) {
      console.log("You are currently on branch " + currentBranch + " which is a fix branch for issue " + match[1] + " and keyword " + match[2]);
      return {issueNumber: match[1], issueKeyword: match[2], cleanDirectory, neededToSwitchToExistingBranch: false};
    }
  }
  if(!cleanDirectory) {
    console.log("Please commit your changes before launching this script.");
    throw ABORTED;
  }
  if(providedIssueNumber != null) {
    // Check if there is an existing fix branch that starts with providedIssueNumber
    var branches = (await execAsync("git branch")).stdout.trim().split("\n").map(b => b.trim());
    var existingFixBranches = branches.filter(b => b.match(new RegExp(`^fix-.*${providedIssueNumber}.*\$`)));
    if(existingFixBranch != null && existingFixBranch.length > 1) {
      console.log("There are multiple fix branches for issue '" + providedIssueNumber + "', please be more specific:\n" + existingFixBranches.join("\n"));
      throw ABORTED;
    }
    if(existingFixBranches != null && existingFixBranches.length == 1) {
      var existingFixBranch = existingFixBranches[0];
      await execLog("git checkout " + existingFixBranch, "Switching to branch " + existingFixBranch);
      // pull the latest changes, if any
      await execLog("git pull", "Pulling the latest changes...", false);
      var m = existingFixBranch.match(new RegExp("^fix-(\\d+)-(.+)$"));
      var issueNumber = m[1];
      var issueKeyword = m[2];
      return {issueNumber, issueKeyword, cleanDirectory, neededToSwitchToExistingBranch: true};
    }
    // Maybe we gave a PR number. We can retrieve the PR and the issue number.
    var js = await getOriginalDafnyIssue(providedIssueNumber);
    if("body" in js && (match = /This PR fixes #(\d+)/.exec(js.body))) {
      console.log("The PR "+providedIssueNumber+" is fixing issue " +match[1] + ". Redirecting...");
      return ensureMasterOrFollowupFix(match[1]);
    }
  }
  if(currentBranch != "master") {
    console.log(`You need to be on the 'master' branch to create ${providedIssueNumber ? "a fix for #" + providedIssueNumber: "a fix."}`);
    if(!ok(await question(`Switch from '${currentBranch}' to 'master'? ${ACCEPT_HINT}`))) {
      console.log("Fixing script aborted.");
      throw ABORTED;
    }
    console.log("switched to master branch");
    console.log((await execAsync("git checkout master")).stdout);
    currentBranch = await getCurrentBranch();
    if(currentBranch != "master") {
      console.log("Failed to checkout master");
      throw ABORTED;
    }
  }
  await execAsync("git pull");
  console.log("Latest master checked out and pulled from origin.")
}

// Pull the JSON of the given issue number
async function getOriginalDafnyIssue(issueNumber) {
  if(!issueNumber.match(/^\d+$/)) {
    console.log(`Not an issue number: ${issueNumber}`);
    return {};
  }
  console.log("Fetching original dafny issue #" + issueNumber);
  return await (await fetch("https://api.github.com/repos/dafny-lang/dafny/issues/" + issueNumber)).json();
}

// Returns the command to test all the tests that this branch depends on, on dotnet
async function xunitTestCmd(issueNumber) {
  // List all the log messages since the branch was created
  var cmd = "git log --oneline --no-merges --pretty=format:%s origin/master..HEAD";
  // Execute the command above using execLog
  var output = (await execLog(cmd, "Listing all the log messages since the branch was created...")).stdout;
  // Keep only the lines of output that start with FIXER:, remove any single quotes on the be and remove the prefix
  var lines = output.split("\n").filter(l => l.startsWith("FIXER:")).map(l => l.substring(6));
  // Split every item by spaces and flatten the result
  var moreTestCases = [].concat.apply([], lines.map(l => l.split(" ")));
  // Prefix every test case with "|DisplayName~" and concatenate everything
  var testCases = moreTestCases.map(t => "|DisplayName~" + t).join("");
  return `dotnet test -v:n Source/IntegrationTests/IntegrationTests.csproj --filter "DisplayName~git-issues/git-issue-${issueNumber}${testCases}"`;
}

// Display useful information to run the tests in VSCode, Rider, dotnet test and dafny itself.
async function displayInformationToDebug(issueNumber, issueKeyword, programArguments, testFile) {
  console.log("-------------------------------------------------------------");
  console.log("| Ensure you put the path of the language server for VSCode:|");
  console.log(`Dafny: Language Server Runtime Path:\n${process.cwd()}/Binaries/DafnyLanguageServer.dll`);
  console.log("-------------------------------------------------------------");
  console.log("| Run the test as part of the XUnit test:                   |");
  console.log((await xunitTestCmd(issueNumber)).replace(/csproj --filter/g, "csproj \\\n--filter").replace(/\|/g, "|\\\n"));
  console.log("-------------------------------------------------------------");
  console.log("| Run dafny on the file directly:                           |");
  console.log("dotnet build Source/DafnyDriver/DafnyDriver.csproj");
  console.log(`./Binaries/Dafny ${programArguments} \"${testFile}\"`);
  console.log("-------------------------------------------------------------");
  console.log("| Create a test configuration in Rider:                     |");
  console.log(`Name:  git-issue-${issueNumber}-${issueKeyword}`);
  console.log("Project:   Dafny");
  console.log("Framework: net6.0");
  console.log(`Exe path:  ${process.cwd()}/Binaries/Dafny.exe`);
  console.log(`Arguments: ${programArguments} "${testFile}"`);
  console.log("Directory: "+process.cwd());
  console.log("-------------------------------------------------------------");

}

// Skips the words "open", "force" and "more" from the arguments,
// sets the flags appropriatedly and returns the remaining of the arguments.
function processArgs() {
  var args = [...process.argv];
  var openFiles = false;
  var skipVerification = false;
  var addOneTestCase = false;
  while(args[2] in {"open": 0, "force": 0, "more": 0}) {
    if(args[2] == "open") {
      args.splice(2, 1);
      openFiles = true;
    } else if(args[2] == "force") {
      args.splice(2, 1);
      skipVerification = true;
    } else {
      args.splice(2, 1);
      addOneTestCase = true;
    }
  }
  return {args, openFiles, skipVerification, addOneTestCase};
}

// Given the arguments, returns the issue number and the issue keyword.
async function getIssueNumberAndKeyword(existingBranch, args) {
  var neededToSwitchToExistingBranch;
  var fixBranchDidExist = false;
  var issueNumber = "";
  if(existingBranch != undefined) {
    var {issueNumber, issueKeyword, neededToSwitchToExistingBranch} = existingBranch;
    fixBranchDidExist = true;
  } else {
    var issueNumber = args[2] ?? await question("What is the git issue number? ");
    var issueKeyword = args[3];
    if(issueKeyword == null || issueKeyword == "") {
      issueKeyword = await getIssueKeyword();
      if(issueKeyword != null && issueKeyword != "") {
        console.log("The suggested issue keyword is the following:\n"+issueKeyword);
      }
      var answer = await question(
        issueKeyword != null && issueKeyword != "" ?
        "Press ENTER to accept it or write your own keyword:\n"
        : "Write a keyword for this issue like this and press ENTER: crash-dafny-resolver:\n");
      if(answer != "") {
        issueKeyword = answer;
      }
    }
    neededToSwitchToExistingBranch = false;
  }
  return {issueNumber, issueKeyword, neededToSwitchToExistingBranch, fixBranchDidExist};
}

let cache = {};
// Returns the issue keyword from the issue number
async function getIssueKeyword(issueNumber = null) {
  var js = issueNumber != null && issueNumber != "" ?
    (issueNumber in cache ? cache[issueNumber] :
      await getOriginalDafnyIssue(issueNumber)) : {};
  cache[issueNumber] = js;
  // Get the body field of the first post
  var issueKeyword = "title" in js ?
    js.title.toLowerCase().replace(/\b(a|the|fix|in|where|about)( |$)/g, "")
    .replace(/[^a-zA-Z0-9]/g, "-") : "";
  while(issueKeyword.indexOf("-") >= 0 && issueKeyword.length > 50) {
    issueKeyword = issueKeyword.replace(/-[^-]*$/, "");
  }
  if(issueKeyword.length > 50) {
    issueKeyword = issueKeyword.substring(0, 50);
  }
  return issueKeyword;
}

// Create the tests fore the given issue number
async function interactivelyCreateTestFileContent(issueNumber = null, commandLineContent = null) {
  // Retrieve the content of the first post from the issue
  var js = issueNumber != null && issueNumber != "" ? await getOriginalDafnyIssue(issueNumber) : {};
  // Get the body field of the first post
  var issueContent = "body" in js ? js.body : "";
  // extract the code contained between ```dafny and ```
  var match = issueContent.match(/```(?:.*dafny)?\r?\n([\s\S]+?)\r?\n```/);
  var programReproducingError = match != null ? match[1] : "";
  var hasMain = programReproducingError.match(/method\s+Main\s*\(/);

  var type = await(question("Do you want to reproduce this problem\nOn the command line (1) (default)\nOn the language server(2)\nDon't create test files(3)? "));
  var languageServer = type == "2";
  var skipTestCreation = type == "3";
  if(skipTestCreation) {
    return {programReproducingError, languageServer, skipTestCreation};
  }
  var shouldCompile = !languageServer && ok(await question("Will the test need to be compiled? "+ACCEPT_HINT));
  var shouldRun = shouldCompile && (hasMain || ok(await question("Will the test need to be run (i.e. will have a Main() method)? "+ACCEPT_HINT)));
  var shouldCompileBackend = shouldCompile ? await filterQuestion("Which back-end should be used? cs (default), js, java, go, cpp, py or all? ", ["", "cs", "js", "java", "go", "cpp", "py", "all"]) : "";

  programReproducingError = programReproducingError == "" ? (commandLineContent ?? (shouldRun ? "method Main() {\n  \n}" : "")) : programReproducingError;
  if(languageServer) {
    console.log("Language server tests is not supported yet. Aborting.");
    throw ABORTED;
    return {programReproducingError, languageServer, skipTestCreation};
  }
  var header = "";
  var programArguments = "";
  if(shouldCompile) {
    if(shouldCompileBackend == "") {
      shouldCompileBackend = "cs";
    }
    var c = shouldRun ? "build" : "run";
    if(shouldCompileBackend == "all") {
      header += `// RUN: %baredafny verify %args "%s" > "%t"\n`;
      header += `// RUN: %baredafny ${c} %args --no-verify -t:cs "%s" >> "%t"\n`;
      header += `// RUN: %baredafny ${c} %args --no-verify -t:js "%s" >> "%t"\n`;
      header += `// RUN: %baredafny ${c} %args --no-verify -t:cpp "%s" >> "%t"\n`;
      header += `// RUN: %baredafny ${c} %args --no-verify -t:java "%s" >> "%t"\n`;
      header += `// RUN: %baredafny ${c} %args --no-verify -t:go "%s" >> "%t"\n`;
      header += `// RUN: %baredafny ${c} %args --no-verify -t:py "%s" >> "%t"\n`;
      programArguments = `${c} -t:cs`;
    } else {
      programArguments = `${c} -t:${shouldCompileBackend}`;
      header += `// RUN: %baredafny ${programArguments} "%s" > "%t"\n`;
    }
  } else {
    header = `// RUN: %baredafny verify %args "%s" > "%t"\n`;
    programArguments = "verify";
  }
  header += `// RUN: %diff "%s.expect" "%t"\n\n`;
  programReproducingError = header + programReproducingError;
  return {programReproducingError, languageServer, skipTestCreation};
}

// Reads an existing test and extract the last dafny command to run
async function getTestArguments(testFile) {
  var testFileContent = await fs.promises.readFile(testFile, { encoding: "utf8" });
  // Find '// RUN: %dafny_0 ... "%s" > "%t"' in testFileContent
  // and return what's in the ellipsis
  var match = testFileContent.match(/\/\/ RUN: %dafny_0\s+([\s\S]+?)\s+"%s"(?![\s\S]*\/\/ RUN: %(bare)?dafny)/);
  if(match == null) {
    var match = testFileContent.match(/\/\/ RUN: %baredafny\s+(build|run|verify) %args ([\s\S]+?)\s+"%s"(?![\s\S]*\/\/ RUN: %(bare)?dafny)/);
    if(match == null) {
      return "verify";
    } else {
      return match[1] + " " + match[2];
    }
  } else {
    return match[1];
  }
}

// Creates the two test files
async function createTestFilesAndExpect(testFile, testFileExpect, testFileContent) {
  await fs.promises.writeFile(testFile, testFileContent);
  await fs.promises.writeFile(testFileExpect, "");
}

// Provides help if DafnyCore.dll cannot be overwritten
async function helpIfDllLock(output) {
  if(typeof output == "object") {
    output = output.stdout + output.stderr;
  }
  const notWindows = process.platform == 'darwin';
  
  for(let dll of ["DafnyCore.dll", "DafnyLanguageServer.dll"]) {
    if(output.match(new RegExp(`warning MSB3026: Could not copy.*${dll}' because it is being used by another process`))) {
      console.log(`Looks like ${dll} is locked by another process. Let's find out which one.`);
      // If we are on Windows, it's a different command
      var command = notWindows ? `lsof -w -Fp Binaries/${dll}` : "tasklist.exe -m "+dll;
      // Run the command and report to the user what they need to do
      var processLocking = (await execLog(command, `Finding which process is locking "+dll+"`)).stdout;
      console.log(processLocking);
      if((match = /\d{4}\d*/.exec(processLocking)) &&
         ok(await question(`Do you want to kill the process ${match[0]}? ${ACCEPT_HINT}`))) {
        if(notWindows) {
          await execLog(`kill -9 ${match[0]}`, `Killing process ${match[0]}`);
        } else {
          await execLog(`taskkill /F /PID ${match[0]}`, `Killing process ${match[0]}`);	
        }
        console.log(`You can start the script again. If this occurs again, you might want to close VSCode.`);
      } else {
        console.log(`Please close the process that is locking ${dll} and then press restart the command.`);
      }
    }
  }
}

// Build the Dafny solution
async function buildSolution(issueNumber) {
  var output = await execLog("dotnet build Source/Dafny.sln", `Rebuilding Dafny to work on issue #${issueNumber}`);
  await helpIfDllLock(output);
}

// Open the given file in its default editor.
function openAndYield(cmd) {
  var start = (process.platform == 'darwin'? 'open': process.platform == 'win32'? 'start': 'xdg-open');
  execLog(`${start} ${cmd}`, `Opening file ${cmd}`);
}

// Creates the branch for the given issue number, and add all the provided test files to it.
async function createBranchAndAddTestFiles(issueNumber, branchName, testFiles) {
  await execLog(`git checkout -b ${branchName}`, `Creating branch ${branchName}...`);
  if(testFiles.length > 0) {
    await execLog(`git add ${testFiles.join(" ")}`, "Adding test files to git...");
  }
  await execLog(`git commit -m "Add test for issue #${issueNumber}"`, "Committing files...");
}

// Verify if the tests of the given branch pass
async function verifyFix(issueNumber) {
  var testCmd = await xunitTestCmd(issueNumber);
  console.log("Running:"+testCmd);
  var testResult = await execLog(testCmd, "\nCompiling and verifying that you did fix the issue...", false);
  testResult = testResult.stdout + testResult.stderr;
  var verified = testResult.match(/Failed:\s*0\s*,\s*Passed:\s*(?!0)/);
  return {ok: verified, log: testResult};
}

// Returns true if this branch was already pushed
async function originAlreadyExists(branchName) {
  var testOrigin = await execLog(`git log origin/${branchName}..${branchName}`, "Look at whether this branch was pushed previously...", false);
  testOrigin = testOrigin.stdout + testOrigin.stderr;
  return testOrigin.match(/unknown revision or path not in the working tree/) == null;
}

// Asks for the release notes lines, while providing the current issue's title as input to the user.
async function getReleaseNotesLine(issueNumber) {
  console.log("Getting the previous issue title...");
  var js = await getOriginalDafnyIssue(issueNumber);
  var releaseNotesLine = js.title;
  if(releaseNotesLine === undefined) {
    console.log(`Could not retrieve issue #${issueNumber}'s title but that's ok. Got this instead`, js);
  } else {
    console.log("This was the title of the issue: '" + releaseNotesLine + "'");
  }
  releaseNotesLine = await question("What should we put in the release notes?\nFix: ");
  return releaseNotesLine;
}

// Add the docs/dev/news/<issueNumber>.fix file
async function addTownCrierEntry(issueNumber, releaseNotesLine) {
  var towncrier = `docs/dev/news/${issueNumber}.fix`;
  if(!fs.existsSync(towncrier)) {
    await execLog(`touch ${towncrier}`, `Creating file ${towncrier}`);
    await execLog(`git add ${towncrier}`, `Adding file ${towncrier}`);
  }
  await fs.promises.writeFile(towncrier, releaseNotesLine);
}

// Ads all files matching the given pattern to git.
async function addAll(pattern, message) {
  var testFiles = await execLog(`ls ${pattern}`, `Listing all ${message}`);
  testFiles = testFiles.stdout.split("\n").map(file => file.trim());
  var toAdd = testFiles.join(" ");
  await execLog(`git add ${toAdd}`, "Adding all "+message+" to git...");
}

// Add all the files, commit them and push them.
async function commitAllAndPush(issueNumber, commitMessage, branchName, testsNowExist) {
  if(testsNowExist) {
    await addAll(getTestFileName(issueNumber, "*"), "the test files");
    await addAll(getTestFileExpectName(issueNumber, "*"), "the expect files");
  }
  await execLog(`git commit -am \"${commitMessage}\"`, "Committing the fix (and dotnet format)...", false);
  await execLog(`git commit -am \"${commitMessage}\"`, "Just ensuring the fix is committed in case there was formatting involved...", false);
  await execLog(`git push origin --set-upstream ${branchName}`, "Pushing the fix to GitHub...");
}

function getTestFileName(issueNumber, suffix = "") {
  return `Test/git-issues/git-issue-${issueNumber}${suffix}.dfy`;
}
function getTestFileExpectName(issueNumber, suffix = "") {
  return getTestFileName(issueNumber, suffix)+".expect";
}
// Adds one more existing test to the branch by adding it in an empty commit.
async function doAddOneExistingTestCase(testName) {
  // List all the files in Test/ that contain "testName", which might contain a directory separator
  var testFiles = await execLog(`find Test/ -name "*.dfy"`, "Listing all the test files that contain "+testName);
  testFiles = testFiles.stdout.split("\n").map(file => file.trim());
  // Remove "Test/" from the prefix of each file
  testFiles = testFiles.map(file => file.substring(5));
  var testFile = testFiles.filter(file => file.indexOf(testName) >= 0);
  if(testFile.length == 0) {
    console.log("Could not find the test file for "+testName);
    throw ABORTED;
  } else {
    console.log(`The following test file${testFile.length > 1 ? "s" : ""} will be added:`);
    for(var file of testFile) {
      console.log(file);
    }
    if(!ok(await question(`Confirm? ${ACCEPT_HINT}`))) {
      return;
    }
    var commitMessage = `FIXER:${testFile.join(" ")}`;
    await execLog(`git commit --only --allow-empty -m "${commitMessage}"`, "Adding the tests files...");
  }
}
// Process `fix more` with the given detected issueNumber, and moreText is the argument after "more".
async function doAddOneTestCase(issueNumber, moreText) {
  var otherIssueNumber = moreText || await question("What is the issue number of the other test case? You can also enter an existing test name. Blank if you just want two new test files: ");
  if(!otherIssueNumber.match(/^\d+$/)) {
    console.log("The issue number seems to be an existing test case. Adding them to this branches' tests...");
    return await doAddOneExistingTestCase(otherIssueNumber);
  }
  
  var suffix = "abcdefghijklmnopqrstuvwxyz";
  var indexSuffix = 0;
  while(indexSuffix < suffix.length && fs.existsSync(getTestFileName(issueNumber, suffix[indexSuffix]))) {
    indexSuffix++;
  }
  if(indexSuffix == suffix.length) {
    console.log("You have too many test cases for this issue. Please merge some.");
    throw ABORTED;
  }

  suffix = suffix[indexSuffix];
  var {programReproducingError: otherTestFileContent, languageServer, skipTestCreation} =
    await interactivelyCreateTestFileContent(otherIssueNumber);
  if(languageServer) {
    console.log("Language server not supported yet. Aborting.");
    throw ABORTED;
  }
  if(skipTestCreation) {
    throw ABORTED;
  }
  var otherTestFile = getTestFileName(issueNumber, suffix);
  var otherTestFileExpect = getTestFileExpectName(issueNumber, suffix);
  console.log(`Going to create the test files ${otherTestFile} and ${otherTestFileExpect}...`);
  await createTestFilesAndExpect(otherTestFile, otherTestFileExpect, otherTestFileContent);
  openAndYield(otherTestFile);
  openAndYield(otherTestFileExpect);
}

// We will want to run tests on the language server at some point
// (DafnyLanguageServer/Synchronization/DiagnosticTests.cs).

// The main function
async function Main() {
  var {openFiles, skipVerification, addOneTestCase, args} = processArgs();
  var fixBranchDidExist = false;
  var testFileContent = "";
  var languageServer = false; // TODO
  var skipTestCreation = false;
  try {
    var existingBranch = await ensureMasterOrFollowupFix(args[2], addOneTestCase);
    var {issueNumber, issueKeyword, neededToSwitchToExistingBranch, fixBranchDidExist} =
      await getIssueNumberAndKeyword(existingBranch, args);
    var branchName = `fix-${issueNumber}-${issueKeyword}`;
    var testFile = getTestFileName(issueNumber);
    var testFileExpect = getTestFileExpectName(issueNumber);
    var testFilesDidExist = fs.existsSync(testFile);
    if(!testFilesDidExist && addOneTestCase) {
      addOneTestCase = false; // This will be automatic
    }
    // assert testFilesDidExist || !addOneTestCase

    if(existingBranch === undefined || !testFilesDidExist) {
      var {programReproducingError: testFileContent, languageServer, skipTestCreation} =
        await interactivelyCreateTestFileContent(issueNumber, args[4]);
    }
    if(!testFilesDidExist && !skipTestCreation) {
      await createTestFilesAndExpect(testFile, testFileExpect, testFileContent);
    }
    var testsNowExist = testFilesDidExist || !skipTestCreation;
    if(addOneTestCase) {
      await doAddOneTestCase(issueNumber, args[2]);
    }

    if(!skipTestCreation && (!fixBranchDidExist || openFiles || neededToSwitchToExistingBranch)) {
      openAndYield(testFile);
      openAndYield(testFileExpect);
    }
    if(neededToSwitchToExistingBranch) { // We opened the files previously, but we rebuild the solution afterwards. Is that ok?
      await buildSolution(issueNumber);
    }

    if(!fixBranchDidExist) {
      await createBranchAndAddTestFiles(issueNumber, branchName,
        skipTestCreation ? [] : [testFile, testFileExpect]);
    }
    if(testsNowExist) {
      var testArguments = await getTestArguments(testFile);
      await displayInformationToDebug(issueNumber, issueKeyword, testArguments, testFile);
    }
    if((!fixBranchDidExist || !testFilesDidExist || openFiles) &&
        (!skipVerification || !skipTestCreation)) {
      var withoutOpen = open ? " (without 'open')" : "";
      console.log(`All set! Now focus on making the test git-issues/git-issue-${issueNumber}.dfy to pass. You can add additional tests such as git-issues/git-issue-${issueNumber}.dfy`);
      console.log(`When the tests succeed, re-run this script to verify the fix and create the PR.\nYou can run the same command-line${withoutOpen}.`);
    } else {
      var testResult = {};
      if(skipVerification || ((testResult = await verifyFix(issueNumber), testResult.ok)) && !neededToSwitchToExistingBranch) {
        var wasPushed = await originAlreadyExists(branchName);
        if(skipVerification) {
          console.log(`You indicated "force", so you assume that this commit solves the issue #${issueNumber}.`);
        } else {
          console.log(`\nCongratulations for ${wasPushed ? "ensuring this new commit still solves" : "solving"} issue #${issueNumber}!`);
        }

        if(!wasPushed && !ok(await question("Are you ready to create the PR? " + ACCEPT_HINT))) {
          throw ABORTED;
        }
        var commitMessage = "";
        if(!wasPushed) {
          var releaseNotesLine = await getReleaseNotesLine(issueNumber);
          await addTownCrierEntry(issueNumber, releaseNotesLine);
          var prContent = `This PR fixes #${issueNumber}\nI added the corresponding test.\n\n<small>By submitting this pull request, I confirm that my contribution is made under the terms of the [MIT license](https://github.com/dafny-lang/dafny/blob/master/LICENSE.txt).</small>`;
          commitMessage = `Fix: ${releaseNotesLine}`;
        } else {
          commitMessage = await question("What should be the commit message?\n");
        }
        await commitAllAndPush(issueNumber, commitMessage, branchName, testsNowExist);
        if(!wasPushed) {
          var url = `https://github.com/dafny-lang/dafny/compare/${branchName}?expand=1&title=`+encodeURIComponent(commitMessage)+"&body="+encodeURIComponent(prContent);
          console.log("Opening the browser to create a PR at this URL...:\n"+url);
          await open(url);
          console.log("Look at your browser, it should be opened.");
        } else {
          console.log("Updated the PR.");
        }
      } else {
        if(neededToSwitchToExistingBranch && testResult.ok) {
          console.log("The tests are passing as expected. Run 'fix' when you have something new to verify.\n");
        } else {
          console.log(testResult.log);
          console.log("The test did not pass. Please fix the issue and re-run this script after ensuring that the following command-line succeeds:\n");
          console.log(await xunitTestCmd(issueNumber));
          await helpIfDllLock(testResult.log);
        }
      }
    }
  } catch(e) {
    if(e != ABORTED) {
      throw e;
    }
  } finally {
    close();
  }
}

Main();