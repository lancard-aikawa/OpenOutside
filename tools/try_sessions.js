// Usage: node tools/try_sessions.js <cwd> [n]   -> lists sessions with titles, and times loading the largest one
const { projectDirs, listSessions, sessionTitle, Extractor, Tail } = require("../extract");
const cwd = process.argv[2] || process.cwd();
const n = Number(process.argv[3] || 15);
let t0 = Date.now();
const list = listSessions(projectDirs(cwd));
const titles = list.map((s) => sessionTitle(s));
console.log(`${list.length} sessions, titles in ${Date.now() - t0} ms`);
list.slice(0, n).forEach((s, i) =>
  console.log(new Date(s.mtime).toISOString().slice(0, 16), String(Math.round(s.size / 1024)).padStart(6), "KB ", titles[i])
);
const big = [...list].sort((a, b) => b.size - a.size)[0];
if (big) {
  t0 = Date.now();
  const ex = new Extractor(cwd);
  new Tail(big.file).read((l) => ex.line(l));
  console.log(`largest ${Math.round(big.size / 1048576)} MB: ${ex.turns.length} prompts, ${ex.items.size} paths, ${Date.now() - t0} ms`);
}
