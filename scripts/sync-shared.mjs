// The server (functions/) and the browser (src/) share a few pure files. Cloudflare Functions are deployed on their own, so the
// server keeps byte-identical copies in functions/_shared/. The files in src/ are the ORIGINALS; never edit the copies by hand.
//
//   npm run sync:shared          copy the originals over the server copies
//   node scripts/sync-shared.mjs --check   exit 1 if any copy has drifted (runs automatically before every build)
import fs from "fs";

const SHARED = ["beceStyle.js", "wassceStyle.js", "freeTierLimits.js", "mathPrompt.js", "moderation.js", "regenPrompt.js"];
const root = new URL("../", import.meta.url);
const at = (dir, f) => new URL(`${dir}/${f}`, root);
const checkOnly = process.argv.includes("--check");

const drifted = [];
for (const f of SHARED) {
  const original = fs.readFileSync(at("src", f));
  const copyPath = at("functions/_shared", f);
  const same = fs.existsSync(copyPath) && fs.readFileSync(copyPath).equals(original);
  if (same) continue;
  drifted.push(f);
  if (!checkOnly) fs.writeFileSync(copyPath, original);
}

if (checkOnly && drifted.length) {
  console.error(`\nThe server copies of these files differ from src/: ${drifted.join(", ")}\nEdit the file in src/ only, then run:  npm run sync:shared\n`);
  process.exit(1);
}
console.log(drifted.length ? `synced: ${drifted.join(", ")}` : `shared files are in sync (${SHARED.length} checked)`);
