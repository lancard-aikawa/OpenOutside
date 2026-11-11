// Usage: node tools/try_extract.js <cwd>   -> prints paths found in the newest session of that folder
const { projectDirs, newestSession, Extractor, Tail } = require("../extract");
const cwd = process.argv[2] || process.cwd();
const dirs = projectDirs(cwd);
const file = newestSession(dirs);
console.log("dirs:", dirs);
console.log("session:", file);
if (!file) process.exit(1);
const ex = new Extractor(cwd);
new Tail(file).read((l) => ex.line(l));
console.log("title:", ex.title);
for (const it of ex.list()) console.log(it.kind.padEnd(7), it.isDir ? "dir " : "file", it.path);
