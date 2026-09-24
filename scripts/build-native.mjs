import { spawnSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { stdio: "inherit", env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(npm, ["run", "build"], { ...process.env, BASE_PATH: "" });

const webOutput = resolve("out");
const nativeOutput = resolve("out-native");
if (!existsSync(webOutput)) throw new Error("Next.js did not create the out/ export.");
rmSync(nativeOutput, { recursive: true, force: true });
cpSync(webOutput, nativeOutput, { recursive: true });

run("npx", ["cap", "sync", "ios"], {
  ...process.env,
  CAPACITOR_WEB_DIR: "out-native",
});
