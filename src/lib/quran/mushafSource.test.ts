// ===================== سلامةُ مصدر المصحف =====================
// بياناتُ أوجه المصحف وخطُّها ليسا كوداً يُراجَع في diff: 31 ملفّ JSON مضغوطة
// الشكل، وملفُّ خطٍّ ثنائيّ. تغيّرٌ فيها بحادثٍ — أداةُ تنسيقٍ أعادت كتابة JSON،
// تحريرٌ بيد، ملفٌّ تلف في دمج، خطٌّ استُبدل بنسخةٍ أخرى من «أميري قرآن»
// بمقاييس مختلفة — يمرّ بلا أن يوقفه شيء، ثمّ يظهر عند القارئ سطراً يفيض عن
// عرضه أو وجهاً بترقيمٍ منزلق.
//
// وهو أيضاً حارسُ **الإسناد**: هذه الملفّات مشتقّةٌ من مصدرٍ خارجيّ له ترخيصه
// (راجع `THIRD-PARTY-NOTICES.md`)، فتبدّلُها بلا قصدٍ يعني أنّ ما نوثّقه لم يعد
// وصفاً لما نشحنه.
//
// حين يسقط هذا الاختبار: إن كان التغيّر مقصوداً (أُعيد التوليد من المصدر) شغّل
// `node scripts/gen-mushaf-integrity.mjs` وراجِع الناتج في الالتزام نفسه؛ وإلّا
// فالملفُّ هو ما يُصلَح لا البصمة.
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CHUNK_COUNT } from "./mushafLayout";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "licenses/mushaf-integrity.json"), "utf8")
) as {
  source: { package: string; version: string; variant: string; integrity: string; tarballSha256: string };
  font: { path: string; bytes: number; sha256: string };
  generated: { dir: string; chunks: Record<string, string> };
};

const sha256 = (p: string) => createHash("sha256").update(fs.readFileSync(p)).digest("hex");

describe("خطّ وجه المصحف", () => {
  it("هو الملفّ الذي قِيس عليه التخطيط، بايتةً بايتة", () => {
    const p = path.join(ROOT, manifest.font.path);
    expect(fs.existsSync(p), manifest.font.path).toBe(true);
    expect(fs.statSync(p).size, "حجم الخطّ").toBe(manifest.font.bytes);
    // نسخةٌ أخرى من «أميري قرآن» بمقاييس مختلفة تُخرج الأسطر عن عرضها المحفوظ.
    expect(sha256(p), "بصمة الخطّ").toBe(manifest.font.sha256);
  });
});

describe("بيانات الأوجه المولَّدة", () => {
  const dir = path.join(ROOT, manifest.generated.dir);
  const names = Object.keys(manifest.generated.chunks);

  it("عددُ الحِزَم كما يفترضه الكود، بلا زيادةٍ ولا نقص", () => {
    expect(names.length).toBe(CHUNK_COUNT);
    const onDisk = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
    expect(onDisk).toEqual(names);
  });

  it("كلُّ حزمةٍ ببصمتها المسجّلة", () => {
    const drifted: string[] = [];
    for (const [name, hash] of Object.entries(manifest.generated.chunks)) {
      if (sha256(path.join(dir, name)) !== hash) drifted.push(name);
    }
    expect(drifted, "حِزَمٌ تغيّرت عن المسجّل").toEqual([]);
  });
});

describe("وصفُ المصدر", () => {
  it("مثبَّتٌ على إصدارٍ ونسخةٍ بعينهما", () => {
    expect(manifest.source.package).toBe("quran-madina-html");
    expect(manifest.source.version).toBe("1.0.1");
    expect(manifest.source.variant).toBe("Madina05-Amiri_Quran-16px");
    expect(manifest.source.integrity).toMatch(/^sha512-/);
    expect(manifest.source.tarballSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  // مولّدُ التخطيط هو من يثبّت الإصدار والنسخة فعلاً — فلا ينزلق أحدهما عن الآخر.
  it("مطابقٌ لما يثبّته مولّدُ التخطيط", () => {
    const gen = fs.readFileSync(path.join(ROOT, "scripts/gen-mushaf-layout.mjs"), "utf8");
    expect(gen).toContain(`const PKG_VERSION = "${manifest.source.version}";`);
    expect(gen).toContain(`const VARIANT = "${manifest.source.variant}";`);
    expect(gen).toContain(`const PKG = "${manifest.source.package}";`);
  });
});

describe("ملفّات الإشعارات والتراخيص", () => {
  // الإسنادُ يُشحن مع الكود لا يُترك لذاكرةِ أحد: غيابُ أحدها إخلالٌ بشرط
  // المصدر، وسقوطُ هذا الاختبار أرخص من اكتشافه بعد النشر.
  it("موجودةٌ وغيرُ فارغة", () => {
    for (const f of [
      "THIRD-PARTY-NOTICES.md",
      "licenses/quran-madina-html-1.0.1-LICENSE.md",
      "licenses/Waqf-GPL-2.0-AR.txt",
      "licenses/Waqf-GPL-2.0-EN.txt",
      "licenses/OFL-1.1-AmiriQuran.txt",
    ]) {
      const p = path.join(ROOT, f);
      expect(fs.existsSync(p), f).toBe(true);
      expect(fs.statSync(p).size, f).toBeGreaterThan(0);
    }
  });

  it("نسخةُ ترخيص المصدر هي نصُّه كما ورد في الحزمة المثبَّتة", () => {
    const txt = fs.readFileSync(
      path.join(ROOT, "licenses/quran-madina-html-1.0.1-LICENSE.md"), "utf8"
    );
    expect(txt).toContain('"Waqf" General Public License 2.0');
  });

  // التعارض غيرُ محسوم (ISC في package.json مقابل «وقف» في LICENSE.md داخل
  // الحزمة نفسها). ما دام كذلك، يجب أن يبقى **مذكوراً صراحةً** في الإشعارات
  // بدل أن يُطوى بصمتٍ فيبدو الترخيصُ محسوماً وهو ليس كذلك.
  it("تعارضُ الترخيص مذكورٌ صراحةً في الإشعارات", () => {
    const notices = fs.readFileSync(path.join(ROOT, "THIRD-PARTY-NOTICES.md"), "utf8");
    expect(notices).toContain("ISC");
    expect(notices).toContain("Waqf");
    expect(notices).toMatch(/غير محسوم|لم يُحسم/);
  });
});
