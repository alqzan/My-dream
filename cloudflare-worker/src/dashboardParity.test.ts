import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// ===================== نسختان لوسيطٍ واحد =====================
// `src/index.ts` هي المصدر، و`worker.dashboard.js` هي **ما يُلصَق فعلاً** في
// محرّر Cloudflare ويُنشَر. فتعديلٌ في الأولى دون الثانية يعني إصلاحاً مكتوباً
// في المستودع وغائباً عن الخدمة الحيّة — وهو أسوأُ من عدم إصلاحه، لأنّ
// الاختبارات تمرّ فيُظنّ الأمرُ منتهياً.
//
// المقارنةُ حرفاً بحرفٍ لا تصلح (الأنواعُ مُزالة في الثانية عمداً)، فتُقارَن
// **جُمَلُ المنطق**: كلُّ سطرٍ يقرّر شيئاً في المصدر يجب أن يوجد هناك.

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const ts = read("./index.ts");
const js = read("../worker.dashboard.js");

// تُجرّد التعليقات والمسافات فتبقى الجملةُ وحدها.
const normalize = (src: string) =>
  src
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//") && !l.startsWith("*") && !l.startsWith("/*"))
    .join("\n");

describe("worker.dashboard.js لا يتخلّف عن src/index.ts", () => {
  const tsBody = normalize(ts);
  const jsBody = normalize(js);

  // قراراتٌ أمنيةٌ وسلوكيةٌ يجب أن تكون في المنشور، لا في المصدر وحده.
  const invariants = [
    'const storedDigest = existing?.customMetadata?.sha256;',
    'customMetadata: { sha256: declaredDigest },',
    'if (!/^[a-f0-9]{64}$/.test(declaredDigest)) throw new HttpError(400, "Missing content digest");',
    'if (!constantTimeEqual(actualDigest, declaredDigest)) throw new HttpError(400, "Content digest does not match");',
    'if (!Number.isSafeInteger(exp) || exp < Date.now()) throw new HttpError(403, "Download link expired");',
    'if (!constantTimeEqual(sig, expected)) throw new HttpError(403, "Invalid download signature");',
    'throw new HttpError(403, "Origin is not allowed");',
  ];

  for (const line of invariants) {
    it(`يحمل: ${line.slice(0, 58)}…`, () => {
      expect(tsBody, "غاب عن المصدر").toContain(line);
      expect(jsBody, "غاب عن نسخة اللوحة — عدّلها معها").toContain(line);
    });
  }

  it("والمسارات الأربعة نفسُها في الاثنين", () => {
    for (const route of ["/health", "/v1/media/blob", "/v1/media/put", "/v1/media/download-url", "/v1/media/inventory"]) {
      expect(tsBody).toContain(route);
      expect(jsBody).toContain(route);
    }
  });
});
