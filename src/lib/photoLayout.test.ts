import { describe, it, expect } from "vitest";
import { collageLayout, isWallFeature } from "./photoLayout";

describe("collageLayout — كل بلاطةٍ داخل الشبكة ولا تتراكب", () => {
  for (const count of [1, 2, 3, 4, 5, 9, 200]) {
    it(`يملأ الشبكة بلا تراكبٍ ولا تجاوز عند ${count} صورة`, () => {
      const { cols, rows, tiles } = collageLayout(count);
      const seen = new Set<string>();
      for (const t of tiles) {
        expect(t.col).toBeGreaterThanOrEqual(1);
        expect(t.row).toBeGreaterThanOrEqual(1);
        expect(t.col + t.colSpan - 1).toBeLessThanOrEqual(cols);
        expect(t.row + t.rowSpan - 1).toBeLessThanOrEqual(rows);
        for (let c = t.col; c < t.col + t.colSpan; c++) {
          for (let r = t.row; r < t.row + t.rowSpan; r++) {
            const cell = `${c}:${r}`;
            expect(seen.has(cell)).toBe(false); // بلاطتان في خانةٍ واحدة
            seen.add(cell);
          }
        }
      }
      // لا فجوات: التخطيطات الأربعة كلّها تملأ شبكتها كاملة.
      expect(seen.size).toBe(cols * rows);
    });
  }

  it("يعرض كل الصور بلا شارةِ فائضٍ حتى الأربع", () => {
    for (const count of [1, 2, 3, 4]) {
      const l = collageLayout(count);
      expect(l.tiles).toHaveLength(count);
      expect(l.overflow).toBe(0);
      expect(l.tiles.map((t) => t.index)).toEqual([...Array(count).keys()]);
    }
  });

  it("يقصر العرض على أربعٍ ويعدّ الباقي في الشارة", () => {
    const l = collageLayout(11);
    expect(l.tiles).toHaveLength(4);
    expect(l.overflow).toBe(7);
  });

  it("لا شيء يُرسم لصفر صور", () => {
    expect(collageLayout(0).tiles).toHaveLength(0);
    expect(collageLayout(-3).tiles).toHaveLength(0);
  });
});

describe("isWallFeature — بلاطةٌ كبيرة في كل دورة", () => {
  it("يبدأ الجدار ببلاطةٍ كبيرة ثمّ يكرّرها كل ستّ", () => {
    expect(isWallFeature(0)).toBe(true);
    expect(isWallFeature(6)).toBe(true);
    expect(isWallFeature(12)).toBe(true);
    for (const i of [1, 2, 3, 4, 5, 7, 11]) expect(isWallFeature(i)).toBe(false);
  });

  it("الدورة تملأ صفوفَ ثلاثة أعمدة تماماً (4 خانات + 5 = 9)", () => {
    // مجموع الخانات في دورةٍ كاملة يجب أن يقبل القسمة على عدد الأعمدة (3)،
    // وإلّا تركت الدورة فجوةً تتراكم مع طول الجدار.
    let cells = 0;
    for (let i = 0; i < 6; i++) cells += isWallFeature(i) ? 4 : 1;
    expect(cells % 3).toBe(0);
  });
});
