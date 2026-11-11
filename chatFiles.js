// "Chat Files" view: files and folders that appear in the newest Claude Code session of this workspace.
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { projectDirs, newestSession, listSessions, sessionTitle, Extractor, Tail } = require("./extract");

const KIND_LABEL = { edit: "edited", read: "read", mention: "" };
const MAX_ITEMS = 300;

class ChatFilesProvider {
  constructor() {
    this._onDidChange = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChange.event;
    this.session = null;
    this.extractor = null;
    this.tail = null;
    this.watchers = [];
    this.timer = null;
    this.view = null;
    this.pinned = null; // a chosen session file; null = follow the newest
  }

  pin(file) {
    this.pinned = file;
    vscode.commands.executeCommand("setContext", "openOutside.pinned", !!file);
    this.update();
  }

  cwd() {
    const f = vscode.workspace.workspaceFolders;
    return f && f.length ? f[0].uri.fsPath : null;
  }

  start() {
    this.stop();
    const cwd = this.cwd();
    if (!cwd) return;
    for (const dir of projectDirs(cwd)) {
      try {
        this.watchers.push(fs.watch(dir, () => this.schedule()));
      } catch {}
    }
    this.update();
  }

  stop() {
    for (const w of this.watchers) w.close();
    this.watchers = [];
  }

  schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.update(), 400);
  }

  update() {
    const cwd = this.cwd();
    if (!cwd) return;
    const file = this.pinned || newestSession(projectDirs(cwd));
    if (!file) return;
    let changed = false;
    if (file !== this.session) {
      this.session = file;
      this.extractor = new Extractor(cwd);
      this.tail = new Tail(file);
      changed = true;
    }
    const before = this.extractor.seq;
    this.tail.read((l) => this.extractor.line(l));
    if (this.view) {
      const title = this.extractor.title || path.basename(file, ".jsonl").slice(0, 8);
      this.view.description = this.pinned ? `${title} · pinned` : title;
    }
    if (changed || this.extractor.seq !== before) this._onDidChange.fire();
  }

  getTreeItem(it) {
    if (it.files) return this.turnItem(it);
    const uri = vscode.Uri.file(it.path);
    const item = new vscode.TreeItem(uri, vscode.TreeItemCollapsibleState.None);
    item.id = `${it.turnId}|${it.path}`;
    item.label = path.basename(it.path) || it.path;
    const parent = path.dirname(it.path);
    const cwd = this.cwd();
    const rel = cwd ? path.relative(cwd, parent) : parent;
    const where = !rel ? "." : rel.startsWith("..") || path.isAbsolute(rel) ? parent : rel;
    item.description = [KIND_LABEL[it.kind], where].filter(Boolean).join("  ");
    item.tooltip = it.path;
    item.contextValue = it.isDir ? "chatFolder" : "chatFile";
    item.command = it.isDir
      ? { command: "openOutside.openFolder", title: "Folder", arguments: [uri] }
      : { command: "vscode.open", title: "Open", arguments: [uri] };
    return item;
  }

  // One row per prompt; the newest starts open, the rest closed (VS Code remembers later toggles by id).
  turnItem(t) {
    const newest = this.turnsCache && this.turnsCache[0] && this.turnsCache[0].id === t.id;
    const S = vscode.TreeItemCollapsibleState;
    const item = new vscode.TreeItem(t.label, newest ? S.Expanded : S.Collapsed);
    item.id = `turn|${t.id}`;
    const hhmm = t.time ? new Date(t.time).toTimeString().slice(0, 5) : "";
    item.description = [String(t.files.length), hhmm].filter(Boolean).join("  ");
    item.tooltip = t.text || t.label;
    item.iconPath = new vscode.ThemeIcon("comment");
    item.contextValue = "chatTurn";
    return item;
  }

  getChildren(el) {
    if (!this.extractor) return [];
    if (!el) return (this.turnsCache = this.extractor.turnList().slice(0, MAX_ITEMS));
    if (el.files) return el.files.map((f) => ({ ...f, turnId: el.id }));
    return [];
  }
}

// Pick which session the view shows. The first entry goes back to following the newest one.
async function pickSession(provider) {
  const cwd = provider.cwd();
  if (!cwd) return;
  const sessions = listSessions(projectDirs(cwd));
  const fmt = (ms) => {
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const items = [
    { label: "$(sync) Latest", description: "follow the newest session", file: null },
    { label: "", kind: vscode.QuickPickItemKind.Separator },
    ...sessions.map((s) => ({
      label: sessionTitle(s),
      description: fmt(s.mtime),
      detail: s.file === provider.session ? "$(eye) showing now" : undefined,
      file: s.file,
    })),
  ];
  const pick = await vscode.window.showQuickPick(items, {
    title: "Chat Files: session",
    placeHolder: "Type to filter by title",
    matchOnDescription: true,
  });
  if (!pick) return;
  provider.pin(pick.file);
}

function register(context, openOutside) {
  const provider = new ChatFilesProvider();
  const view = vscode.window.createTreeView("openOutside.chatFiles", { treeDataProvider: provider });
  provider.view = view;
  const uriOf = (x) => (x instanceof vscode.Uri ? x : x && x.path ? vscode.Uri.file(x.path) : null);
  context.subscriptions.push(
    view,
    { dispose: () => provider.stop() },
    vscode.commands.registerCommand("openOutside.refresh", () => provider.start()),
    vscode.commands.registerCommand("openOutside.history", () => pickSession(provider)),
    vscode.commands.registerCommand("openOutside.latest", () => provider.pin(null)),
    vscode.commands.registerCommand("openOutside.openFolder", (x) => {
      const uri = uriOf(x);
      if (uri) vscode.env.openExternal(uri);
    }),
    vscode.commands.registerCommand("openOutside.reveal", (x) => {
      const uri = uriOf(x);
      if (uri) vscode.commands.executeCommand("revealFileInOS", uri);
    }),
    vscode.commands.registerCommand("openOutside.edit", (x) => {
      const uri = uriOf(x);
      if (uri) vscode.commands.executeCommand("vscode.openWith", uri, "default");
    }),
    vscode.commands.registerCommand("openOutside.copyPath", (x) => {
      const uri = uriOf(x);
      if (uri) vscode.env.clipboard.writeText(uri.fsPath);
    }),
    vscode.commands.registerCommand("openOutside.openItem", (x) => openOutside(uriOf(x))),
    vscode.workspace.onDidChangeWorkspaceFolders(() => provider.start())
  );
  provider.start();
}

module.exports = { register };
