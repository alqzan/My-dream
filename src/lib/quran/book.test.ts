import { describe, it, expect } from "vitest";
import {
  spreadOf, sameSpread, leafStack, edgeWidth, outerEdge, turnStep,
  EDGE_MIN_PX, EDGE_MAX_PX,
} from "./book";
import { TOTAL_PAGES } from "./meta";

describe("spreadOf", () => {
  it("أوّل وجهٍ مفتوح: الفاتحة يميناً وأوّل البقرة يساراً", () => {
    expect(spreadOf(1)).toEqual({ right: 1, left: 2 });
    expect(spreadOf(2)).toEqual({ right: 1, left: 2 });
  });

  it("التقرين فردية↔التالية لها، لا زوجية↔فردية", () => {
    expect(spreadOf(9)).toEqual({ right: 9, left: 10 });
    expect(spreadOf(10)).toEqual({ right: 9, left: 10 });
    // ص8 و9 ليستا في وجهٍ واحد — بينهما قلبُ ورقة
    expect(sameSpread(8, 9)).toBe(false);
    expect(sameSpread(9, 10)).toBe(true);
  });

  it("آخر المصحف (604 زوجية) يُقرن بـ603 ولا يخرج عن الحدود", () => {
    expect(spreadOf(TOTAL_PAGES)).toEqual({ right: TOTAL_PAGES - 1, left: TOTAL_PAGES });
  });

  it("خارج الحدود يُقصّ إلى المصحف", () => {
    expect(spreadOf(0)).toEqual({ right: 1, left: 2 });
    expect(spreadOf(9999)).toEqual({ right: TOTAL_PAGES - 1, left: TOTAL_PAGES });
  });

  it("كلّ صفحةٍ في المصحف تقع في وجهها، وصفحتاه متتاليتان", () => {
    for (let p = 1; p <= TOTAL_PAGES; p++) {
      const s = spreadOf(p);
      expect(p === s.right || p === s.left).toBe(true);
      expect(s.right % 2).toBe(1); // اليُمنى فردية دائماً
      if (s.left != null) expect(s.left).toBe(s.right + 1);
    }
  });
});

describe("leafStack", () => {
  it("في أوّل المصحف لا شيء خلفك وكلّه أمامك", () => {
    const s = leafStack(1);
    expect(s.before).toBe(0);
    expect(s.after).toBe(TOTAL_PAGES - 1);
    expect(s.beforePct).toBe(0);
    expect(s.afterPct).toBe(1);
  });

  it("في آخر المصحف ينعكس الأمر", () => {
    const s = leafStack(TOTAL_PAGES);
    expect(s.before).toBe(TOTAL_PAGES - 1);
    expect(s.after).toBe(0);
    expect(s.afterPct).toBe(0);
  });

  it("المجموع ثابتٌ أينما وقفت", () => {
    for (const p of [1, 50, 302, 500, TOTAL_PAGES]) {
      const s = leafStack(p);
      expect(s.before + s.after).toBe(TOTAL_PAGES - 1);
    }
  });
});

describe("edgeWidth", () => {
  it("محصورٌ بين الحدّين مهما كانت النسبة", () => {
    expect(edgeWidth(0)).toBe(EDGE_MIN_PX);
    expect(edgeWidth(1)).toBe(EDGE_MAX_PX);
    expect(edgeWidth(-5)).toBe(EDGE_MIN_PX);
    expect(edgeWidth(9)).toBe(EDGE_MAX_PX);
  });

  it("يكبر باطّراد مع النسبة", () => {
    expect(edgeWidth(0.75)).toBeGreaterThan(edgeWidth(0.25));
  });
});

describe("outerEdge", () => {
  it("الطرف الخارجيّ يمينُ اليُمنى ويسارُ اليُسرى", () => {
    expect(outerEdge(1)).toBe("right");
    expect(outerEdge(2)).toBe("left");
  });
});

describe("turnStep", () => {
  it("السحب يميناً تقدّمٌ (حركة الورقة في الكتاب العربيّ)", () => {
    expect(turnStep(90)).toBe(1);
  });

  it("السحب يساراً رجوع", () => {
    expect(turnStep(-90)).toBe(-1);
  });

  it("ما دون العتبة لا يقلب ورقة (لمسةٌ عابرة لا تُضيّع موضعك)", () => {
    expect(turnStep(20)).toBe(0);
    expect(turnStep(-20)).toBe(0);
    expect(turnStep(0)).toBe(0);
  });

  it("العتبة قابلةٌ للضبط", () => {
    expect(turnStep(30, 20)).toBe(1);
    expect(turnStep(30, 40)).toBe(0);
  });
});
