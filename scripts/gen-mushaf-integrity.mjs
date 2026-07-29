#!/usr/bin/env node
// ===================== تحديث بصمات مصدر المصحف =====================
// يعيد كتابة `licenses/mushaf-integrity.json` من الملفّات كما هي على القرص.
//
// **لا يُشغَّل في البناء ولا في CI**، ولا يُشغَّل لإسكات اختبارٍ أحمر. اختبارُ
// السلامة (`src/lib/quran/mushafSource.test.ts`) يسقط حين تتغيّر بايتةٌ من
// بيانات المصحف أو من الخطّ — وذلك التغيّر إمّا **مقصود** (أُعيد توليد البيانات
// من المصدر عبر `gen-mushaf-layout.mjs`) فيُشغَّل هذا السكربت وتُراجَع نتيجته في
// الالتزام نفسه، وإمّا **حادث** (تحريرٌ بيد، أداةٌ أعادت تنسيق JSON، ملفٌّ تلف)
// فيُصلَح الملفّ لا البصمة.
//
// أمّا حقول `source` (اسم الحزمة وإصدارها وبصمة npm) فتُكتب بيدٍ هنا عند ترقية
// المصدر — بعد مراجعةِ ترخيصه من جديد (راجع THIRD-PARTY-NOTICES.md).
//
//     node scripts/gen-mushaf-integrity.mjs
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = path.join(ROOT, "licenses/mushaf-integrity.json");
const CHUNK_DIR = "src/lib/quran/mushaf";

const sha256 = (p) => createHash("sha256").update(fs.readFileSync(p)).digest("hex");

const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));

// الخطّ والبيانات المولَّدة تُقاس من القرص؛ وصفُ المصدر يبقى كما هو (يُحرَّر بيد).
manifest.font.bytes = fs.statSync(path.join(ROOT, manifest.font.path)).size;
manifest.font.sha256 = sha256(path.join(ROOT, manifest.font.path));

const dir = path.join(ROOT, CHUNK_DIR);
const chunks = {};
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
  chunks[f] = sha256(path.join(dir, f));
}
manifest.generated = { dir: CHUNK_DIR, chunks };

fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
console.log(`mushaf-integrity.json: ${Object.keys(chunks).length} حزمة · الخطّ ${manifest.font.sha256.slice(0, 12)}…`);
