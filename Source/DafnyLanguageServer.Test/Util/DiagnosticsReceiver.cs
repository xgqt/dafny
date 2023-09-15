using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using OmniSharp.Extensions.LanguageServer.Protocol.Models;
using Xunit;
using XunitAssertMessages;

namespace Microsoft.Dafny.LanguageServer.IntegrationTest.Util;

public class DiagnosticsReceiver : TestNotificationReceiver<PublishDiagnosticsParams> {

  public async Task<Diagnostic[]> AwaitNextWarningOrErrorDiagnosticsAsync(CancellationToken cancellationToken,
    TextDocumentItem textDocumentItem = null) {
    var result = await AwaitNextDiagnosticsAsync(cancellationToken, textDocumentItem);
    return result.Where(d => d.Severity <= DiagnosticSeverity.Warning).ToArray();
  }

  public async Task<Diagnostic[]> AwaitNextDiagnosticsAsync(CancellationToken cancellationToken,
    TextDocumentItem textDocumentItem = null) {
    var result = await AwaitNextNotificationAsync(cancellationToken);
    if (textDocumentItem != null) {
      AssertM.Equal(textDocumentItem.Version, result.Version,
        $"received incorrect version, diagnostics were: [{string.Join(", ", result.Diagnostics)}]");
      Assert.Equal(textDocumentItem.Uri, result.Uri);
    }
    return result.Diagnostics.ToArray();
  }
}
