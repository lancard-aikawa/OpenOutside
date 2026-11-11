// Open Outside: hand files to the OS default app instead of opening a VS Code tab.
// Which file types go outside is decided by the user's `workbench.editorAssociations`.
const vscode = require("vscode");

async function openOutside(uri) {
  if (!uri || uri.scheme !== "file") {
    // Remote (WSL / SSH) paths do not exist on this machine; fall back to the normal editor.
    if (uri) await vscode.commands.executeCommand("vscode.openWith", uri, "default");
    vscode.window.showWarningMessage("Open Outside: only local files can be opened outside.");
    return false;
  }
  const ok = await vscode.env.openExternal(uri);
  if (!ok) vscode.window.showErrorMessage(`Open Outside: could not open ${uri.fsPath}`);
  return ok;
}

class ExternalEditorProvider {
  openCustomDocument(uri) {
    return { uri, dispose() {} };
  }
  async resolveCustomEditor(document, panel) {
    // Close the placeholder tab right away, then hand the file to the OS.
    panel.webview.html = "<html><body></body></html>";
    setTimeout(() => panel.dispose(), 0);
    await openOutside(document.uri);
  }
}

function activate(context) {
  require("./chatFiles").register(context, openOutside);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider("openOutside.external", new ExternalEditorProvider(), {
      supportsMultipleEditorsPerDocument: true,
    }),
    vscode.commands.registerCommand("openOutside.open", (uri) => {
      uri = uri || vscode.window.activeTextEditor?.document.uri;
      return openOutside(uri);
    })
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
