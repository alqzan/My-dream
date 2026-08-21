import type { JournalPhotoEdit } from "./types";
import type { MediaSource } from "./mediaSources";

/**
 * مفتاح ثابت لصورةٍ في واجهة المذكرة.
 *
 * مراجع R2 تستخدم هاش المحتوى نفسه. أمّا الصورة المضمّنة محلياً فنستخدم
 * بصمة صغيرة حتمية من النص (بدلاً من حفظ نسخة أخرى من الصورة أو تغييرها).
 * البصمة ليست لأغراض أمنية؛ الغرض الوحيد أن تبقى إعدادات العرض مرتبطةً
 * بالصورة نفسها بعد إعادة الرسم والمزامنة.
 */
export function photoEditKey(source: MediaSource): string {
  if (source.hash) return `${source.kind ?? "photos"}:${source.hash}`;
  const value = source.inline ?? "";
  let hash = 2166136261;
  // أخذ عينات موزعة يجعل الحساب خفيفاً حتى للصور المضغوطة الكبيرة، مع إدخال
  // الطول كي لا تتساوى صورٌ مختلفة لها بداية متشابهة.
  const step = Math.max(1, Math.ceil(value.length / 4096));
  for (let i = 0; i < value.length; i += step) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= value.length;
  hash = Math.imul(hash, 16777619);
  return `inline:${(hash >>> 0).toString(16)}`;
}

export const DEFAULT_PHOTO_EDIT: JournalPhotoEdit = {
  rotation: 0,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  flipX: false,
  flipY: false,
};

export function normalizePhotoEdit(edit?: JournalPhotoEdit): JournalPhotoEdit {
  const rotation = edit?.rotation === 90 || edit?.rotation === 180 || edit?.rotation === 270
    ? edit.rotation
    : 0;
  return {
    ...DEFAULT_PHOTO_EDIT,
    ...edit,
    rotation,
    scale: Math.min(3, Math.max(1, Number(edit?.scale ?? 1) || 1)),
    offsetX: Math.min(50, Math.max(-50, Number(edit?.offsetX ?? 0) || 0)),
    offsetY: Math.min(50, Math.max(-50, Number(edit?.offsetY ?? 0) || 0)),
    flipX: Boolean(edit?.flipX),
    flipY: Boolean(edit?.flipY),
  };
}

/** CSS transform مشتركة بين المصغرات، الكولاج، وورقة التحرير. */
export function photoEditTransform(edit?: JournalPhotoEdit): string {
  const e = normalizePhotoEdit(edit);
  const sx = (e.flipX ? -1 : 1) * (e.scale ?? 1);
  const sy = (e.flipY ? -1 : 1) * (e.scale ?? 1);
  return `translate(${e.offsetX ?? 0}%, ${e.offsetY ?? 0}%) rotate(${e.rotation ?? 0}deg) scale(${sx}, ${sy})`;
}

export function isDefaultPhotoEdit(edit?: JournalPhotoEdit): boolean {
  const e = normalizePhotoEdit(edit);
  return e.rotation === 0 && e.scale === 1 && e.offsetX === 0 && e.offsetY === 0 && !e.flipX && !e.flipY;
}

