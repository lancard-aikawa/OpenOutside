// Usage: node tools/try_extract.js <cwd>   -> prints, per prompt, the paths found in the newest session of that folder
const { projectDirs, newestSession, Extractor, Tail } = require("../extract");
const cwd = process.argv[2] || process.cwd();
const file = newestSession(projectDirs(cwd));
console.log("session:", file);
if (!file) process.exit(1);
const ex = new Extractor(cwd);
new Tail(file).read((l) => ex.line(l));
console.log("title:", ex.title, " prompts:", ex.turns.length);
for (const t of ex.turnList()) {
  console.log(`# ${t.label}  (${t.files.length})`);
  for (const it of t.files) console.log("   ", it.kind.padEnd(7), it.path);
}
