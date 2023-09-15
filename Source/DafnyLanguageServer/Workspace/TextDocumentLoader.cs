﻿using Microsoft.Dafny.LanguageServer.Language;
using Microsoft.Dafny.LanguageServer.Language.Symbols;
using Microsoft.Dafny.LanguageServer.Workspace.Notifications;
using OmniSharp.Extensions.LanguageServer.Protocol.Models;
using System;
using System.Collections.Generic;
using System.Collections.Immutable;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Boogie;
using Microsoft.Extensions.Logging;
using Range = OmniSharp.Extensions.LanguageServer.Protocol.Models.Range;

namespace Microsoft.Dafny.LanguageServer.Workspace {
  /// <summary>
  /// Text document loader implementation that offloads the whole load procedure on one dedicated
  /// thread with a stack size of 256MB. Since only one thread is used, document loading is implicitely synchronized.
  /// The verification runs on the calling thread.
  /// </summary>
  /// <remarks>
  /// The increased stack size is necessary to solve the issue https://github.com/dafny-lang/dafny/issues/1447.
  /// </remarks>
  public class TextDocumentLoader : ITextDocumentLoader {
    private readonly ILogger<ITextDocumentLoader> logger;
    private readonly IDafnyParser parser;
    private readonly ISymbolResolver symbolResolver;
    private readonly ISymbolTableFactory symbolTableFactory;
    private readonly IGhostStateDiagnosticCollector ghostStateDiagnosticCollector;

    protected TextDocumentLoader(
      ILogger<ITextDocumentLoader> documentLoader,
      IDafnyParser parser,
      ISymbolResolver symbolResolver,
      ISymbolTableFactory symbolTableFactory,
      IGhostStateDiagnosticCollector ghostStateDiagnosticCollector) {
      this.logger = documentLoader;
      this.parser = parser;
      this.symbolResolver = symbolResolver;
      this.symbolTableFactory = symbolTableFactory;
      this.ghostStateDiagnosticCollector = ghostStateDiagnosticCollector;
    }

    public static TextDocumentLoader Create(
      IDafnyParser parser,
      ISymbolResolver symbolResolver,
      ISymbolTableFactory symbolTableFactory,
      IGhostStateDiagnosticCollector ghostStateDiagnosticCollector,
      ILogger<ITextDocumentLoader> logger
      ) {
      return new TextDocumentLoader(logger, parser, symbolResolver, symbolTableFactory, ghostStateDiagnosticCollector);
    }

    public IdeState CreateUnloaded(Compilation compilation) {
      return CreateDocumentWithEmptySymbolTable(compilation, ImmutableDictionary<Uri, IReadOnlyList<Diagnostic>>.Empty);
    }

    public async Task<CompilationAfterParsing> ParseAsync(DafnyOptions options, Compilation compilation,
      IReadOnlyDictionary<Uri, DocumentVerificationTree> migratedVerificationTrees, CancellationToken cancellationToken) {
#pragma warning disable CS1998
      return await await DafnyMain.LargeStackFactory.StartNew(
        async () => ParseInternal(options, compilation, migratedVerificationTrees, cancellationToken), cancellationToken
#pragma warning restore CS1998
      );
    }

    private CompilationAfterParsing ParseInternal(DafnyOptions options, Compilation compilation,
      IReadOnlyDictionary<Uri, DocumentVerificationTree> migratedVerificationTrees,
      CancellationToken cancellationToken) {
      var project = compilation.Project;
      var errorReporter = new DiagnosticErrorReporter(options, project.Uri);
      var program = parser.Parse(compilation, errorReporter, cancellationToken);
      var compilationAfterParsing = new CompilationAfterParsing(compilation, program, errorReporter.AllDiagnosticsCopy,
        compilation.RootUris.ToDictionary(uri => uri,
          uri => migratedVerificationTrees.GetValueOrDefault(uri) ?? new DocumentVerificationTree(program, uri)));

      return compilationAfterParsing;
    }

    public async Task<CompilationAfterResolution> ResolveAsync(DafnyOptions options,
      CompilationAfterParsing compilation,
      IReadOnlyDictionary<Uri, DocumentVerificationTree> migratedVerificationTrees,
      CancellationToken cancellationToken) {
#pragma warning disable CS1998
      return await await DafnyMain.LargeStackFactory.StartNew(
        async () => ResolveInternal(compilation, migratedVerificationTrees, cancellationToken), cancellationToken);
#pragma warning restore CS1998
    }

    private CompilationAfterResolution ResolveInternal(CompilationAfterParsing compilation,
      IReadOnlyDictionary<Uri, DocumentVerificationTree> migratedVerificationTrees, CancellationToken cancellationToken) {

      var program = compilation.Program;
      var errorReporter = (DiagnosticErrorReporter)program.Reporter;
      if (errorReporter.HasErrors) {
        throw new TaskCanceledException();
      }

      var project = compilation.Project;

      var compilationUnit = symbolResolver.ResolveSymbols(project, program, cancellationToken);
      var legacySymbolTable = symbolTableFactory.CreateFrom(compilationUnit, cancellationToken);

      var newSymbolTable = errorReporter.HasErrors
        ? null
        : symbolTableFactory.CreateFrom(program, compilation, cancellationToken);

      var ghostDiagnostics = ghostStateDiagnosticCollector.GetGhostStateDiagnostics(legacySymbolTable, cancellationToken);

      List<ICanVerify> verifiables;
      if (errorReporter.HasErrorsUntilResolver) {
        verifiables = new();
      } else {
        var symbols = SymbolExtensions.GetSymbolDescendants(program.DefaultModule);
        verifiables = symbols.OfType<ICanVerify>().Where(v => !AutoGeneratedToken.Is(v.RangeToken) &&
                                                              v.ContainingModule.ShouldVerify(program.Compilation) &&
                                                              v.ShouldVerify(program.Compilation) &&
                                                              v.ShouldVerify).ToList();
      }

      return new CompilationAfterResolution(compilation,
        errorReporter.AllDiagnosticsCopy,
        newSymbolTable,
        legacySymbolTable,
        ghostDiagnostics,
        verifiables,
        new(),
        new()
      );
    }

    private IdeState CreateDocumentWithEmptySymbolTable(Compilation compilation,
      IReadOnlyDictionary<Uri, IReadOnlyList<Diagnostic>> resolutionDiagnostics) {
      var dafnyOptions = DafnyOptions.Default;
      var program = new EmptyNode();
      return new IdeState(
        compilation.Version,
        compilation,
        program,
        resolutionDiagnostics,
        SymbolTable.Empty(),
        LegacySignatureAndCompletionTable.Empty(dafnyOptions, compilation.Project),
        ImmutableDictionary<Uri, Dictionary<Range, IdeVerificationResult>>.Empty,
        Array.Empty<Counterexample>(),
        ImmutableDictionary<Uri, IReadOnlyList<Range>>.Empty,
      ImmutableDictionary<Uri, DocumentVerificationTree>.Empty
      );
    }
  }
}
