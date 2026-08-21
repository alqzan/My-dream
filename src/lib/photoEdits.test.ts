import { describe, expect, it } from "vitest";
import {
  DEFAULT_PHOTO_EDIT,
  isDefaultPhotoEdit,
  normalizePhotoEdit,
  photoEditKey,
  photoEditTransform,
} from "./photoEdits";

describe("تحرير الصور غير الهدّام", () => {
  it("يطبّع القيم ويحصر التكبير والإزاحة", () => {
    expect(normalizePhotoEdit({ scale: 9, offsetX: 99, offsetY: -99, rotation: 45 })).toEqual({
      rotation: 0,
      scale: 3,
      offsetX: 50,
      offsetY: -50,
      flipX: false,
      flipY: false,
    });
  });

  it("يعتبر الإعداد الافتراضي بلا سجل تحرير", () => {
    expect(isDefaultPhotoEdit(DEFAULT_PHOTO_EDIT)).toBe(true);
    expect(isDefaultPhotoEdit({ rotation: 90 })).toBe(false);
  });

  it("ينتج تحويل CSS قابلاً لإعادة العرض دون تغيير المصدر", () => {
    expect(photoEditTransform({ rotation: 90, scale: 1.2, offsetX: 4, offsetY: -2, flipX: true })).toContain("rotate(90deg)");
    expect(photoEditTransform({ rotation: 90, scale: 1.2, offsetX: 4, offsetY: -2, flipX: true })).toContain("scale(-1.2, 1.2)");
  });

  it("يعطي مفتاحاً ثابتاً للصورة نفسها، ومفتاحاً مختلفاً لمصدر آخر", () => {
    expect(photoEditKey({ hash: "same", kind: "photos" })).toBe(photoEditKey({ hash: "same", kind: "photos" }));
    expect(photoEditKey({ hash: "same", kind: "photos" })).not.toBe(photoEditKey({ hash: "other", kind: "photos" }));
  });
});
