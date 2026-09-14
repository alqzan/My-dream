import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expenseWeight, offsetPlan, EVENT_DAYS } from "./budgetFlow";
import { effectiveDailyRate } from "./fundPlan";

// ===== حارسُ المعدَّل الفعليّ =====
// القاعدة في `CLAUDE.md`: **`DailyBudgetStatus.rate` هو المصروف اليومي الفعليّ**
// (المضبوط ناقص قطرةِ تمويل المظاريف من راتب الدورة)، وكلُّ عرضٍ أو حسابٍ لمعدّل
// اليوم يقرأ `rate` لا `dailyBudget.amount`.
//
// خُرقت في موضعين، وكلاهما مرّ صامتاً لأنّ الرقمين صحيحان كلٌّ في بابه — وخطآ
// في اتجاهين متعاكسين:
//
//   • `BigExpenseRouter` قاس عتبةَ «الحدث» بالمضبوط، فلم تظهر بطاقةُ التوجيه
//     لمصروفٍ هو في الحقيقة ثلاثُ يوميّاتٍ فأكثر → الضربةُ تنزل على اليومية.
//   • `autoOffsetDeficit` قاس سقفَ المقاصة بالمضبوط، فغطّى صامتاً عجزاً كان
//     بقاعدة `offsetPlan` نفسِها `tooBig` → الفوائض تُفرَغ بلا قرار.
//
// والخطأ يكبر كلّما كثرت خططُ التمويل — أي في الحالة التي بُني لها النظام.
// لا TypeScript يرصده (كلاهما `number`) ولا ESLint، فيُرصد هنا: بالسلوك أوّلاً
// ثمّ بمسحٍ نصّيّ يمنع رجوع الوسيط الخطأ إلى موضع النداء.

const SRC = fileURLToPath(new URL("..", import.meta.url));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p) && !/\.test\./.test(p)) out.push(p);
  }
  return out;
}

// نداءٌ قد يمتدّ على أسطر: نلتقط ما بين قوسَي النداء ثمّ نفحصه كاملاً.
function callArgs(src: string, fn: string): string[] {
  const out: string[] = [];
  const needle = `${fn}(`;
  let at = src.indexOf(needle);
  while (at !== -1) {
    let depth = 0;
    let i = at + needle.length - 1;
    for (; i < src.length; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")" && --depth === 0) break;
    }
    out.push(src.slice(at + needle.length, i));
    at = src.indexOf(needle, i);
  }
  return out;
}

describe("المعدَّل الفعليّ هو ما يُقاس عليه", () => {
  // الفرقُ بالأرقام: مضبوطٌ ١٠٠ وإيجارٌ يسحب ٣٠ يومياً → الفعليّ ٧٠.
  const amount = 100;
  const perDay = 30;
  const rate = effectiveDailyRate(amount, perDay);

  it("المضبوط والفعليّ ليسا رقماً واحداً", () => {
    expect(rate).toBe(70);
  });

  it("فاتورةُ ٢٥٠ حدثٌ بالفعليّ ولا تكاد تُرى بالمضبوط", () => {
    // ٢٥٠ ÷ ٧٠ = ٣٫٦ يوميّات → حدثٌ يستحقّ مظروفاً.
    expect(expenseWeight(250, rate)).toEqual({ days: 3.6, big: true });
    // وبالمضبوط ٢٫٥ فقط → البطاقة لا تظهر، والضربةُ تنزل على اليومية.
    expect(expenseWeight(250, amount).big).toBe(false);
  });

  it("سقفُ المقاصة ثلاثُ يوميّاتٍ فعلية — وعجزُ ٢٥٠ فوقه فيقف", () => {
    expect(offsetPlan(-250, 5000, rate, true)).toMatchObject({ amount: 0, cap: rate * EVENT_DAYS, reason: "tooBig" });
    // وبالمضبوط كان يُغطّى صامتاً من الفوائض (سقفٌ ٣٠٠ لا ٢١٠).
    expect(offsetPlan(-250, 5000, amount, true)).toMatchObject({ amount: 250, reason: "covered" });
  });

  it("وما دون السقف يُقاصّ كما كان", () => {
    expect(offsetPlan(-100, 5000, rate, true)).toMatchObject({ amount: 100, reason: "covered" });
  });
});

describe("حارسُ مواضع النداء", () => {
  it("لا `expenseWeight` ولا `offsetPlan` يُمرَّر لهما البدلُ المضبوط", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const src = readFileSync(file, "utf8");
      for (const fn of ["expenseWeight", "offsetPlan"]) {
        for (const args of callArgs(src, fn)) {
          // `dailyBudget.amount` / `dailyBudget?.amount` / `s.dailyBudget.amount`
          if (/dailyBudget\s*\??\.\s*amount/.test(args)) offenders.push(`${file.slice(SRC.length)} → ${fn}(…)`);
        }
      }
    }
    expect(offenders, "مرِّر `status.rate` (المعدَّل الفعليّ) لا `dailyBudget.amount`").toEqual([]);
  });
});
