using System;
using System.IO;
using Xunit;
using Xunit.Abstractions;
using Xunit.Sdk;

namespace XUnitExtensions.Lit {
  /// <summary>
  /// This class implements the equivalent of the Unix 'diff' command that lit tests rely on,
  /// because 'diff' does not exist on Windows.
  /// </summary>
  public class DiffCommand : ILitCommand {
    private static readonly bool UpdateExpectFile = false;

    public string ExpectedPath { get; }
    public string ActualPath { get; }

    private DiffCommand(string expectedPath, string actualPath) {
      ExpectedPath = expectedPath;
      ActualPath = actualPath;
    }

    public static ILitCommand Parse(string[] args) {
      if (args.Length != 2) {
        throw new ArgumentException($"Wrong number of arguments for diff: {args}");
      }
      var expectedPath = args[0];
      var actualPath = args[1];
      return new DiffCommand(expectedPath, actualPath);
    }

    public (int, string, string) Execute(TextReader inputReader,
      TextWriter outputWriter, TextWriter errorWriter) {
      var actual = File.ReadAllText(ActualPath);
      if (UpdateExpectFile) {
        var nonSymlinkedPath = Path.GetFullPath(ExpectedPath).Replace("Source/IntegrationTests/bin/Debug/net6.0/TestFiles/LitTests/LitTest", "Test");
        File.WriteAllText(nonSymlinkedPath, actual);
        return (0, "", "");
      }

      var expected = File.ReadAllText(ExpectedPath);
      var diffMessage = AssertWithDiff.GetDiffMessage(expected, actual);
      return diffMessage == null ? (0, "", "") : (1, diffMessage, "");
    }

    public override string ToString() {
      return $"DiffCommand {ExpectedPath} {ActualPath}";
    }
  }
}