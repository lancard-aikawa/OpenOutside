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
    // Hand the file to the OS, then close the placeholder tab.
    // Close it through the tab API, not panel.dispose(): disposing the webview
    // under the workbench races with the explorer's preview-tab replacement
    // (single click on the next file) and VS Code shows
    // "'<previous file>' cannot be opened: OverlayWebview has been disposed".
    panel.webview.html = "<html><body></body></html>";
    setTimeout(() => closePlaceholder(document.uri, panel), 0);
    await openOutside(document.uri);
  }
}

function closePlaceholder(uri, panel) {
  const key = uri.toString();
  const tabs = vscode.window.tabGroups.all
    .flatMap((g) => g.tabs)
    .filter((t) => t.input instanceof vscode.TabInputCustom
      && t.input.viewType === "openOutside.external"
      && t.input.uri.toString() === key);
  if (tabs.length === 0) {
    // No tab to close (should not happen); fall back to the old way.
    try { panel.dispose(); } catch { /* already gone */ }
    return;
  }
  vscode.window.tabGroups.close(tabs).then(undefined, () => { /* already closed */ });
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
