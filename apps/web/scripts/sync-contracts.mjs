// scripts/sync-contracts.mjs: copy shared contracts and published debunks into the app.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(app, "..", "..");

function copyDir(from, to, keep) {
  if (!existsSync(from)) return console.warn(`[sync] missing ${from}, keeping committed copies`);
  mkdirSync(to, { recursive: true });
  for (const f of readdirSync(from)) if (keep(f)) copyFileSync(join(from, f), join(to, f));
}

mkdirSync(join(app, "src/contracts"), { recursive: true });
if (existsSync(join(root, "contracts/types.ts")))
  copyFileSync(join(root, "contracts/types.ts"), join(app, "src/contracts/types.ts"));
copyDir(join(root, "contracts/fixtures"), join(app, "src/contracts/fixtures"), (f) => f.endsWith(".json"));
copyDir(join(root, "data/published"), join(app, "public/published"), (f) => f.endsWith(".json"));
if (existsSync(join(root, "data/calendar.json")))
  copyFileSync(join(root, "data/calendar.json"), join(app, "public/calendar.json"));
console.log("[sync] done");
