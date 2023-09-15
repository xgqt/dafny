// Copyright by the contributors to the Dafny Project
// SPDX-License-Identifier: MIT

using System;
using System.Collections.Generic;
using System.CommandLine;
using System.Diagnostics.Contracts;
using System.IO;
using System.Linq;

namespace Microsoft.Dafny {
  public enum ErrorLevel {
    Info, Warning, Error
  }

  public enum MessageSource {
    Parser, Cloner, RefinementTransformer, Rewriter, Resolver, Translator, Verifier, Compiler, Documentation, TestGeneration
  }

  public record DafnyRelatedInformation(IToken Token, string Message);
  public record DafnyDiagnostic(string ErrorId, IToken Token, string Message,
    MessageSource Source, ErrorLevel Level,
    IReadOnlyList<DafnyRelatedInformation> RelatedInformation);

  public abstract class ErrorReporter {
    public DafnyOptions Options { get; }

    protected ErrorReporter(DafnyOptions options) {
      this.Options = options;
    }

    public bool ErrorsOnly { get; set; }

    public bool HasErrors => ErrorCount > 0;
    public int ErrorCount => Count(ErrorLevel.Error);
    public bool HasErrorsUntilResolver => ErrorCountUntilResolver > 0;
    public int ErrorCountUntilResolver => CountExceptVerifierAndCompiler(ErrorLevel.Error);

    public virtual bool Message(MessageSource source, ErrorLevel level, string errorId, IToken tok, string msg) {
      if (Options.WarningsAsErrors && level == ErrorLevel.Warning) {
        level = ErrorLevel.Error;
      }

      return MessageCore(source, level, errorId, tok, msg);

    }

    protected abstract bool MessageCore(MessageSource source, ErrorLevel level, string errorId, IToken tok, string msg);

    public void Error(MessageSource source, IToken tok, string msg) {
      Error(source, ParseErrors.ErrorId.none, tok, msg);
    }
    public virtual void Error(MessageSource source, string errorId, IToken tok, string msg) {
      Contract.Requires(tok != null);
      Contract.Requires(msg != null);
      Message(source, ErrorLevel.Error, errorId, tok, msg);
    }

    public abstract int Count(ErrorLevel level);
    public abstract int CountExceptVerifierAndCompiler(ErrorLevel level);

    // This method required by the Parser
    internal void Error(MessageSource source, Enum errorId, Uri uri, int line, int col, string msg) {
      var tok = new Token(line, col);
      tok.Uri = uri;
      Error(source, errorId, tok, msg);
    }

    public void Error(MessageSource source, IToken tok, string format, params object[] args) {
      Contract.Requires(tok != null);
      Contract.Requires(format != null);
      Contract.Requires(args != null);
      Error(source, ParseErrors.ErrorId.none, tok, format, args);
    }

    public void Error(MessageSource source, Enum errorId, IToken tok, string format, params object[] args) {
      Contract.Requires(tok != null);
      Contract.Requires(format != null);
      Contract.Requires(args != null);
      Error(source, errorId.ToString(), tok, String.Format(format, args));
    }

    public void Error(MessageSource source, Enum errorId, IToken tok, string msg) {
      Contract.Requires(tok != null);
      Contract.Requires(msg != null);
      Error(source, errorId.ToString(), tok, msg);
    }

    public void Error(MessageSource source, Declaration d, string format, params object[] args) {
      Contract.Requires(d != null);
      Contract.Requires(format != null);
      Contract.Requires(args != null);
      Error(source, ParseErrors.ErrorId.none, d.tok, format, args);
    }

    public void Error(MessageSource source, Enum errorId, Declaration d, string msg, params object[] args) {
      Contract.Requires(d != null);
      Contract.Requires(msg != null);
      Contract.Requires(args != null);
      Error(source, errorId, d.tok, msg, args);
    }

    public void Error(MessageSource source, Enum errorId, Statement s, string format, params object[] args) {
      Contract.Requires(s != null);
      Contract.Requires(format != null);
      Contract.Requires(args != null);
      Error(source, errorId, s.Tok, format, args);
    }

    public void Error(MessageSource source, Statement s, string format, params object[] args) {
      Contract.Requires(s != null);
      Contract.Requires(format != null);
      Contract.Requires(args != null);
      Error(source, ParseErrors.ErrorId.none, s.Tok, format, args);
    }

    public void Error(MessageSource source, INode v, string format, params object[] args) {
      Contract.Requires(v != null);
      Contract.Requires(format != null);
      Contract.Requires(args != null);
      Error(source, ParseErrors.ErrorId.none, v.Tok, format, args);
    }

    public void Error(MessageSource source, Enum errorId, INode v, string format, params object[] args) {
      Contract.Requires(v != null);
      Contract.Requires(format != null);
      Contract.Requires(args != null);
      Error(source, errorId, v.Tok, format, args);
    }

    public void Error(MessageSource source, Enum errorId, Expression e, string format, params object[] args) {
      Contract.Requires(e != null);
      Contract.Requires(format != null);
      Contract.Requires(args != null);
      Error(source, errorId, e.tok, format, args);
    }

    public void Error(MessageSource source, Expression e, string format, params object[] args) {
      Contract.Requires(e != null);
      Contract.Requires(format != null);
      Contract.Requires(args != null);
      Error(source, ParseErrors.ErrorId.none, e.tok, format, args);
    }

    public void Warning(MessageSource source, Enum errorId, IToken tok, string format, params object[] args) {
      Contract.Requires(tok != null);
      Contract.Requires(format != null);
      Contract.Requires(args != null);
      Warning(source, errorId, tok, String.Format(format, args));
    }

    public void Warning(MessageSource source, Enum errorId, IToken tok, string msg) {
      Contract.Requires(tok != null);
      Contract.Requires(msg != null);
      if (Options.WarningsAsErrors) {
        Error(source, errorId.ToString(), tok, msg);
      } else {
        Message(source, ErrorLevel.Warning, errorId.ToString(), tok, msg);
      }
    }

    public void Warning(MessageSource source, string errorId, IToken tok, string msg) {
      Contract.Requires(tok != null);
      Contract.Requires(msg != null);
      Message(source, ErrorLevel.Warning, errorId, tok, msg);
    }

    public void Deprecated(MessageSource source, Enum errorId, IToken tok, string msg) {
      Contract.Requires(tok != null);
      Contract.Requires(msg != null);
      if (Options.DeprecationNoise != 0) {
        Warning(source, errorId, tok, msg);
      }
    }

    public void Deprecated(MessageSource source, Enum errorId, IToken tok, string format, params object[] args) {
      Contract.Requires(tok != null);
      Contract.Requires(format != null);
      Contract.Requires(args != null);
      if (Options.DeprecationNoise != 0) {
        Warning(source, errorId, tok, String.Format(format, args));
      }
    }

    public void Info(MessageSource source, IToken tok, string msg) {
      Contract.Requires(tok != null);
      Contract.Requires(msg != null);
      Message(source, ErrorLevel.Info, null, tok, msg);
    }

    public void Info(MessageSource source, IToken tok, string msg, params object[] args) {
      Contract.Requires(tok != null);
      Contract.Requires(msg != null);
      Contract.Requires(args != null);
      Info(source, tok, String.Format(msg, args));
    }

    public string ErrorToString(ErrorLevel header, IToken tok, string msg) {
      return $"{tok.TokenToString(Options)}: {header.ToString()}: {msg}";
    }
  }

  public class ConsoleErrorReporter : BatchErrorReporter {
    private ConsoleColor ColorForLevel(ErrorLevel level) {
      switch (level) {
        case ErrorLevel.Error:
          return ConsoleColor.Red;
        case ErrorLevel.Warning:
          return ConsoleColor.Yellow;
        case ErrorLevel.Info:
          return ConsoleColor.Green;
        default:
          throw new cce.UnreachableException();
      }
    }

    protected override bool MessageCore(MessageSource source, ErrorLevel level, string errorId, IToken tok, string msg) {
      if (base.MessageCore(source, level, errorId, tok, msg) && (Options is { PrintTooltips: true } || level != ErrorLevel.Info)) {
        // Extra indent added to make it easier to distinguish multiline error messages for clients that rely on the CLI
        msg = msg.Replace("\n", "\n ");

        ConsoleColor previousColor = Console.ForegroundColor;
        if (Options.OutputWriter == Console.Out) {
          Console.ForegroundColor = ColorForLevel(level);
        }
        var errorLine = ErrorToString(level, tok, msg);
        while (tok is NestedToken nestedToken) {
          tok = nestedToken.Inner;
          if (tok.Filepath == nestedToken.Filepath &&
              tok.line == nestedToken.line &&
              tok.col == nestedToken.col) {
            continue;
          }
          msg = nestedToken.Message ?? "[Related location]";
          errorLine += $" {msg} {tok.TokenToString(Options)}";
        }

        if (Options.Verbose && !String.IsNullOrEmpty(errorId) && errorId != "none") {
          errorLine += " (ID: " + errorId + ")\n";
          var info = ErrorRegistry.GetDetail(errorId);
          if (info != null) {
            errorLine += info; // already ends with eol character
          }
        } else {
          errorLine += "\n";
        }

        if (Options.Get(DafnyConsolePrinter.ShowSnippets) && tok != Token.NoToken) {
          TextWriter tw = new StringWriter();
          new DafnyConsolePrinter(Options).WriteSourceCodeSnippet(tok.ToRange(), tw);
          Options.OutputWriter.Write(tw.ToString());
        }

        Options.OutputWriter.Write(errorLine);

        if (Options.OutputWriter == Console.Out) {
          Console.ForegroundColor = previousColor;
        }
        return true;
      }

      return false;
    }

    public ConsoleErrorReporter(DafnyOptions options) : base(options) {
    }
  }

  public class ErrorReporterSink : ErrorReporter {
    public ErrorReporterSink(DafnyOptions options) : base(options) { }

    protected override bool MessageCore(MessageSource source, ErrorLevel level, string errorId, IToken tok, string msg) {
      return false;
    }

    public override void Error(MessageSource source, string errorId, IToken tok, string msg) {

    }

    public override int Count(ErrorLevel level) {
      return 0;
    }

    public override int CountExceptVerifierAndCompiler(ErrorLevel level) {
      return 0;
    }
  }

  public class ErrorReporterWrapper : BatchErrorReporter {

    private string msgPrefix;
    public readonly ErrorReporter WrappedReporter;

    public ErrorReporterWrapper(ErrorReporter reporter, string msgPrefix) : base(reporter.Options) {
      this.msgPrefix = msgPrefix;
      this.WrappedReporter = reporter;
    }

    protected override bool MessageCore(MessageSource source, ErrorLevel level, string errorId, IToken tok, string msg) {
      base.MessageCore(source, level, errorId, tok, msg);
      return WrappedReporter.Message(source, level, errorId, tok, msgPrefix + msg);
    }
  }
}
