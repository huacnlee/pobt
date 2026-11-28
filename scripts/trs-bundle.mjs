// The translations as POBT updates them without a release (ext/pobt-native/src/trs_update.rs).
//
//   node scripts/trs-bundle.mjs version          writes trs/version.json: when each language last changed
//   node scripts/trs-bundle.mjs bundle <dir>     also writes <dir>/trs-<language>.zip and <dir>/trs.json
//
// A language's date is the commit time of the last commit that changed its folder, so it needs the whole history
// (`fetch-depth: 0`). The release puts trs/version.json in the app; the `trs` release carries the bundles, and an
// installed POBT takes a language's bundle when it is newer than what it has.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const [mode, out] = process.argv.slice(2);
if (!["version", "bundle"].includes(mode) || (mode === "bundle" && !out)) {
  console.error("usage: node scripts/trs-bundle.mjs version | bundle <dir>");
  process.exit(2);
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const languages = readdirSync("trs").filter((d) => statSync(join("trs", d)).isDirectory()).sort();
const versions = {};
for (const language of languages) {
  const date = Number(git("log", "-1", "--format=%ct", "--", `trs/${language}`));
  if (!date) throw new Error(`trs/${language}: no commit (is the checkout shallow?)`);
  versions[language] = date;
}
writeFileSync("trs/version.json", JSON.stringify(versions, null, 2) + "\n");
console.log(versions);
if (mode === "version") process.exit(0);

const dir = resolve(out);
mkdirSync(dir, { recursive: true });
const manifest = { commit: git("rev-parse", "HEAD"), languages: {} };
for (const language of languages) {
  const file = `trs-${language.toLowerCase()}.zip`;
  const path = join(dir, file);
  rmSync(path, { force: true });
  // The language's files at the top of the archive, as trs_update unpacks them into trs/<language>.
  execFileSync("zip", ["-q", "-r", "-X", "-9", path, "."], { cwd: join("trs", language) });
  const bytes = readFileSync(path);
  manifest.languages[language] = {
    date: versions[language],
    file,
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
writeFileSync(join(dir, "trs.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(manifest);
