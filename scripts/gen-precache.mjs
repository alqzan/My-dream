// Post-build step: scan the exported `out/` tree and write `out/precache.json`
// (the list of URLs the service worker precaches so EVERY route works offline
// after the first install, not just visited ones). Also stamps a build id into
// `out/sw.js` so each deploy's SW bytes change → the browser reinstalls it →
// the new assets get precached (and stale chunks purged).
import { readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";

const OUT = "out";
const basePath = process.env.BASE_PATH || "";

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

const urls = new Set();
for (const file of walk(OUT)) {
  const rel = relative(OUT, file).split(/[\\/]/).join("/");
  if (rel.endsWith(".map")) continue;             // source maps: not needed offline
  if (rel === "sw.js" || rel === "precache.json") continue;
  if (rel === "index.html" || rel.endsWith("/index.html")) {
    // trailingSlash:true → the page is served at its directory URL.
    const dir = rel.slice(0, rel.length - "index.html".length); // keeps trailing "/"
    urls.add(`${basePath}/${dir}`);
  } else if (rel.endsWith(".html")) {
    continue; // real routes are index.html; skip any stray flat html
  } else {
    urls.add(`${basePath}/${rel}`);               // _next chunks, icons, fonts, manifest
  }
}

const list = [...urls].sort();
const buildId = createHash("sha256").update(list.join("\n")).digest("hex").slice(0, 12);
writeFileSync(join(OUT, "precache.json"), JSON.stringify({ buildId, urls: list }));

// Replace the __BUILD__ placeholder in the copied SW so its bytes are unique
// per deploy (forces reinstall → re-precache). Harmless no-op if absent.
const swPath = join(OUT, "sw.js");
try {
  writeFileSync(swPath, readFileSync(swPath, "utf8").replaceAll("__BUILD__", buildId));
} catch { /* sw.js not exported (shouldn't happen) — precache.json still written */ }

console.log(`precache.json: ${list.length} urls · build ${buildId}`);
