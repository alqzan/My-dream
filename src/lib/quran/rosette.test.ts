import { describe, it, expect } from "vitest";
import { scallopPath, ROSETTE_PATH, ROSETTE_BOX, ROSETTE_INNER } from "./rosette";

describe("scallopPath", () => {
  it("مسارٌ مغلقٌ بعدد الأصداف المطلوب", () => {
    const d = scallopPath(12);
    expect(d.startsWith("M ")).toBe(true);
    expect(d.endsWith(" Z")).toBe(true);
    expect(d.match(/ A /g)).toHaveLength(12);
  });

  it("لا يخرج عن مربّع الرسم", () => {
    const nums = [...ROSETTE_PATH.matchAll(/(-?\d+\.\d+)/g)].map((m) => Number(m[1]));
    for (const n of nums) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(ROSETTE_BOX);
    }
  });

  it("الحلقةُ الداخلية أضيقُ من الأصداف فلا تقطعها", () => {
    expect(ROSETTE_INNER).toBeLessThan(36);
  });
});
