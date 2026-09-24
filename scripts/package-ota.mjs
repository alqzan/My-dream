import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const repoRoot = process.cwd();
const nativeDir = resolve(repoRoot, "out-native");
const outputDir = resolve(process.env.OTA_OUTPUT_DIR || "work/ota");
const baseUrl = (process.env.OTA_BASE_URL || "https://alqzan.github.io/My-dream").replace(/\/$/, "");

if (!existsSync(resolve(nativeDir, "index.html"))) {
  throw new Error(`Native export is missing ${nativeDir}/index.html; run npm run build:native first.`);
}

const versionSource = readFileSync(resolve(repoRoot, "src/lib/version.ts"), "utf8");
const buildMatch = versionSource.match(/export const APP_BUILD = (\d+);/);
if (!buildMatch) throw new Error("Could not read APP_BUILD from src/lib/version.ts.");
const appBuild = Number(buildMatch[1]);
const version = `0.1.${appBuild}`;
const filename = `madar-${version}.zip`;
const generatedZip = resolve(repoRoot, filename);

mkdirSync(outputDir, { recursive: true });
rmSync(generatedZip, { force: true });

const cliName = process.platform === "win32" ? "npx.cmd" : "npx";
const cli = spawnSync(
  cliName,
  ["@capgo/cli", "bundle", "zip", "com.alqzan.madar", "--path", nativeDir, "--bundle", version, "--name", filename, "--json"],
  { cwd: repoRoot, encoding: "utf8" },
);
if (cli.error) throw cli.error;
if (cli.status !== 0) {
  process.stderr.write(cli.stdout || "");
  process.stderr.write(cli.stderr || "");
  throw new Error(`Capgo CLI bundle zip exited with status ${cli.status}.`);
}

let result;
try {
  result = JSON.parse(cli.stdout.trim());
} catch {
  throw new Error(`Could not parse Capgo CLI JSON output: ${cli.stdout.trim()}`);
}
const checksum = result.checksum;
if (typeof checksum !== "string" || !/^[a-f0-9]{64}$/.test(checksum)) {
  throw new Error("Capgo CLI did not return a lowercase SHA-256 checksum.");
}
if (!existsSync(generatedZip)) throw new Error(`Capgo CLI did not create ${generatedZip}.`);

const zipPath = resolve(outputDir, basename(filename));
copyFileSync(generatedZip, zipPath);
rmSync(generatedZip, { force: true });
const manifest = {
  appBuild,
  version,
  url: `${baseUrl}/ota/${filename}`,
  checksum,
};
writeFileSync(resolve(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Created ${zipPath}`);
console.log(`Created ${resolve(outputDir, "manifest.json")}`);
