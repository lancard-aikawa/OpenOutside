// Pull file paths out of a Claude Code session JSONL. No VS Code dependency, so it can be tested with plain node.
const fs = require("fs");
const os = require("os");
const path = require("path");

const FILE_TOOLS = { Read: "read", Write: "edit", Edit: "edit", NotebookEdit: "edit" };

// Project folder name Claude uses for a cwd: every non-alphanumeric char becomes "-".
function projectDirName(cwd) {
  return cwd.replace(/[^A-Za-z0-9]/g, "-");
}

// All ~/.claude/projects/* folders that belong to cwd (case differs between sessions: C-- vs c--).
function projectDirs(cwd, home = os.homedir()) {
  const root = path.join(home, ".claude", "projects");
  const want = projectDirName(cwd).toLowerCase();
  try {
    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.toLowerCase() === want)
      .map((d) => path.join(root, d.name));
  } catch {
    return [];
  }
}

function newestSession(dirs) {
  let best = null;
  for (const dir of dirs) {
    let names = [];
    try {
      names = fs.readdirSync(dir).filter((n) => n.endsWith(".jsonl"));
    } catch {
      continue;
    }
    for (const n of names) {
      const p = path.join(dir, n);
      try {
        const m = fs.statSync(p).mtimeMs;
        if (!best || m > best.mtime) best = { file: p, mtime: m };
      } catch {}
    }
  }
  return best && best.file;
}

// Every session of these folders, newest first: { file, mtime, size }.
function listSessions(dirs) {
  const out = [];
  for (const dir of dirs) {
    let names = [];
    try {
      names = fs.readdirSync(dir).filter((n) => n.endsWith(".jsonl"));
    } catch {
      continue;
    }
    for (const n of names) {
      const p = path.join(dir, n);
      try {
        const s = fs.statSync(p);
        out.push({ file: p, mtime: s.mtimeMs, size: s.size });
      } catch {}
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

const CHUNK = 256 * 1024;
const titleCache = new Map(); // file -> { mtime, title }

function readSlice(fd, start, len) {
  const buf = Buffer.alloc(len);
  const n = fs.readSync(fd, buf, 0, len, start);
  return buf.subarray(0, n).toString("utf8");
}

function lastMatch(text, re) {
  let m, last = null;
  while ((m = re.exec(text))) last = m;
  return last;
}

// The session's title without reading the whole file: the last "ai-title" in the tail, else in the head,
// else the last prompt, else the id.
function sessionTitle(s) {
  const hit = titleCache.get(s.file);
  if (hit && hit.mtime === s.mtime) return hit.title;
  let title = "";
  let fd;
  try {
    fd = fs.openSync(s.file, "r");
    const tail = readSlice(fd, Math.max(0, s.size - CHUNK), Math.min(CHUNK, s.size));
    const head = s.size > CHUNK ? readSlice(fd, 0, CHUNK) : "";
    const grab = (re) => {
      const m = lastMatch(tail, re) || lastMatch(head, re);
      if (!m) return "";
      try {
        return JSON.parse(`"${m[1]}"`);
      } catch {
        return m[1];
      }
    };
    title = grab(/"aiTitle":"((?:[^"\\]|\\.)*)"/g) || grab(/"lastPrompt":"((?:[^"\\]|\\.)*)"/g);
  } catch {
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  title = title.replace(/\s+/g, " ").trim();
  if (title.length > 60) title = title.slice(0, 60) + "…";
  if (!title) title = path.basename(s.file, ".jsonl").slice(0, 8);
  titleCache.set(s.file, { mtime: s.mtime, title });
  return title;
}

class Extractor {
  constructor(defaultCwd) {
    this.cwd = defaultCwd;
    this.items = new Map(); // key: lowercased path -> { path, isDir, kind, seq }
    this.turns = []; // one per user prompt: { id, label, text, time, items: Map }
    this.turn = null;
    this.title = "";
    this.seq = 0;
    this.statCache = new Map();
  }

  stat(p) {
    if (this.statCache.has(p)) return this.statCache.get(p);
    let r = null;
    try {
      const s = fs.statSync(p);
      r = s.isDirectory() ? "dir" : "file";
    } catch {}
    this.statCache.set(p, r);
    return r;
  }

  add(p, kind) {
    p = path.normalize(p).replace(/^[a-z]:/, (d) => d.toUpperCase());
    if (/^[A-Za-z]:\\?$/.test(p)) return; // a bare drive is never meant
    const st = this.stat(p);
    if (!st) return;
    if (st === "dir" && kind === "mention") return; // folders named in prose are mostly explanation, not targets
    const key = p.toLowerCase();
    const rank = { mention: 0, read: 1, edit: 2 };
    const put = (map) => {
      const prev = map.get(key);
      const k = prev && rank[prev.kind] > rank[kind] ? prev.kind : kind;
      map.set(key, { path: p, isDir: st === "dir", kind: k, seq: this.seq });
    };
    this.seq++;
    put(this.items);
    if (!this.turn) this.startTurn("(before the first prompt)", "", "", null);
    put(this.turn.items);
  }

  startTurn(id, label, text, time) {
    this.turn = { id, label, text, time, items: new Map() };
    this.turns.push(this.turn);
  }

  // The prompt's first real line, with pasted-content / reminder tags removed.
  static labelOf(text) {
    const plain = text
      .replace(/<(system-reminder|ide_selection|ide_opened_file)>[\s\S]*?<\/\1>/g, "")
      .replace(/<\/?[A-Za-z_][^>]*>/g, "");
    const line = plain.split("\n").map((s) => s.trim()).find(Boolean) || "";
    return line.length > 40 ? line.slice(0, 40) + "…" : line;
  }

  // Accept the candidate, or the longest prefix of it that exists, without cutting back across a separator
  // (so "C:\a\missing.txt" does not turn into "C:\a\").
  addLoose(raw, kind, base) {
    let s = raw.replace(/^file:\/\/\//i, "");
    s = s.replace(/#L\d+(-L?\d+)?$/, "");
    try {
      s = decodeURI(s);
    } catch {}
    s = s.replace(/^%USERPROFILE%/i, os.homedir()).replace(/^~(?=[\\/])/, os.homedir());
    s = s.replace(/^%APPDATA%/i, process.env.APPDATA || "");
    const abs = (x) => (path.isAbsolute(x) ? x : path.resolve(base, x));
    for (let end = s.length; end >= 3; end--) {
      const cut = s.slice(0, end);
      if (end < s.length && /[\\/]/.test(s[end])) break;
      if (cut.endsWith(".")) continue; // "C:\a\..." must not become "C:\a\.." (the parent)
      const p = abs(cut);
      if (this.stat(p)) {
        this.add(p, kind);
        return;
      }
    }
  }

  scanText(text, base) {
    if (!text) return;
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^[a-z]+:\/\//i.test(m[1]) && !/^file:/i.test(m[1])) continue;
      this.addLoose(m[1], "mention", base);
    }
    for (const m of text.matchAll(/(?<![A-Za-z0-9])[A-Za-z]:[\\/][^\s`'"<>|*?]*/g)) this.addLoose(m[0], "mention", base);
    for (const m of text.matchAll(/(?:%USERPROFILE%|%APPDATA%|~)[\\/][^\s`'"<>|*?]*/gi)) this.addLoose(m[0], "mention", base);
    for (const m of text.matchAll(/`([^`\n]+)`/g)) {
      const c = m[1].trim();
      if (/\s/.test(c) || !/[\\/]/.test(c) || /^[A-Za-z]:/.test(c)) continue;
      if (/^[a-z]+:\/\//i.test(c)) continue;
      this.addLoose(c, "mention", base);
    }
  }

  line(raw) {
    let o;
    try {
      o = JSON.parse(raw);
    } catch {
      return;
    }
    if (o.cwd) this.cwd = o.cwd;
    if (o.type === "ai-title" && o.aiTitle) this.title = o.aiTitle;
    if (o.isSidechain) return;
    const content = o.message && o.message.content;
    if (o.type === "user") {
      const texts =
        typeof content === "string" ? [content] : Array.isArray(content) ? content.filter((b) => b.type === "text").map((b) => b.text) : [];
      // A real prompt has text (tool results come back as their own user lines without text) and is not meta.
      if (texts.length && !o.isMeta) {
        const id = o.promptId || o.uuid;
        if (!this.turn || this.turn.id !== id) {
          const label = texts.map((t) => Extractor.labelOf(t)).find(Boolean) || "(prompt)";
          this.startTurn(id, label, texts.join("\n").slice(0, 400), o.timestamp || null);
        }
      }
      for (const t of texts) this.scanText(t, this.cwd);
    } else if (o.type === "assistant" && Array.isArray(content)) {
      for (const b of content) {
        if (b.type === "text") this.scanText(b.text, this.cwd);
        else if (b.type === "tool_use" && FILE_TOOLS[b.name]) {
          const p = b.input && (b.input.file_path || b.input.notebook_path);
          if (p) this.add(path.isAbsolute(p) ? p : path.resolve(this.cwd, p), FILE_TOOLS[b.name]);
        }
      }
    }
  }

  // Newest first.
  list() {
    return [...this.items.values()].sort((a, b) => b.seq - a.seq);
  }

  // Newest prompt first; prompts that touched nothing are left out.
  turnList() {
    return this.turns
      .filter((t) => t.items.size)
      .slice()
      .reverse()
      .map((t) => ({ ...t, files: [...t.items.values()].sort((a, b) => b.seq - a.seq) }));
  }
}

// Reads a growing JSONL from where it left off.
class Tail {
  constructor(file) {
    this.file = file;
    this.offset = 0;
    this.rest = "";
  }
  read(onLine) {
    let fd;
    try {
      fd = fs.openSync(this.file, "r");
      const size = fs.fstatSync(fd).size;
      if (size < this.offset) this.offset = 0;
      if (size === this.offset) return;
      const buf = Buffer.alloc(size - this.offset);
      fs.readSync(fd, buf, 0, buf.length, this.offset);
      // Only consume whole lines, so a multi-byte char is never split between reads.
      const end = buf.lastIndexOf(0x0a);
      if (end < 0) return;
      this.offset += end + 1;
      for (const l of buf.subarray(0, end).toString("utf8").split("\n")) if (l.trim()) onLine(l);
    } catch {
      // locked or vanished: try again on the next change
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
  }
}

module.exports = { projectDirs, projectDirName, newestSession, listSessions, sessionTitle, Extractor, Tail };
