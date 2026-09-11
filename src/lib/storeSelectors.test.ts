import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// ===== حارسُ منتقيات المتجر =====
// `useAppStore()` بلا منتقٍ يشترك في **الحالة كلِّها**: أيُّ تعديلٍ في أيّ ركنٍ
// من التطبيق يُعيد رسمَ المكوّن — وكلُّ كتابةٍ تختم `lastUpdated` فتُوقظ الاشتراك
// أصلاً. فنموذجُ الكتاب كان يُعاد رسمُه حين تُسجَّل صلاة.
//
// القاعدة: منتقٍ لكلّ حقل (`useAppStore((s) => s.x)`). لا تُرصد بـTypeScript ولا
// بـESLint، فتُرصد هنا — كانت اثنين وعشرين موضعاً، والحارسُ يمنع الثالث والعشرين.

const SRC = fileURLToPath(new URL("..", import.meta.url));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p) && !/\.test\./.test(p)) out.push(p);
  }
  return out;
}

describe("لا اشتراكَ في المتجر كلِّه", () => {
  it("كلُّ نداءٍ لـuseAppStore يحمل منتقياً", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const src = readFileSync(file, "utf8");
      src.split("\n").forEach((line, i) => {
        // `useAppStore()` — بلا وسيط — هو النمطُ الممنوع. و`useAppStore.getState()`
        // مسموحٌ (قراءةٌ لمرّةٍ خارج الرسم، لا اشتراك).
        if (/\buseAppStore\(\s*\)/.test(line)) offenders.push(`${file.slice(SRC.length)}:${i + 1}`);
      });
    }
    expect(offenders, "استعمل منتقياً: useAppStore((s) => s.field)").toEqual([]);
  });
});
