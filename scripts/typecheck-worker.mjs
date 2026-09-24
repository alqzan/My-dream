// فحصُ أنواع الـWorker — آخرُ خطوةٍ في `npm run verify`.
// `cloudflare-worker/` حزمةٌ مستقلّة باعتمادياتها (`@cloudflare/workers-types`)،
// و`npm ci` في الجذر لا يثبّتها. فكان `verify` يفشل على نسخةٍ جديدة من المستودع
// بخطأ أنواعٍ مضلِّل لا علاقة له بالتعديل — وهو ما يُغري بتخطّي البوّابة كلِّها.
// هنا: تثبيتٌ واحدٌ عند الغياب فقط (بالقفل، كما يفعل CI)، ثمّ الفحص.
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";

const dir = new URL("../cloudflare-worker/", import.meta.url);
if (!existsSync(new URL("node_modules/@cloudflare/workers-types", dir))) {
  console.log("↻ تثبيت اعتماديات الـWorker (مرّةً واحدة)…");
  execSync("npm ci --no-audit --no-fund", { cwd: dir, stdio: "inherit" });
}
execSync("npm run typecheck", { cwd: dir, stdio: "inherit" });
