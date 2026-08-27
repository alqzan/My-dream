// نقيّةٌ بلا React/Firebase: حارسٌ موحّد لنتائج العمل غير المتزامن في
// المزامنة. أي نتيجةٍ وصلت بعد إلغاء الأثر، أو بعد إعادة بناء مستمعٍ أحدث، أو
// بعد لقطةٍ أحدث منه، يجب أن تُهمل ولا تُرطّب المتجر القديم.
export function isCurrentSyncWork(
  cancelled: boolean,
  generation: number,
  currentGeneration: number,
  event?: number,
  currentEvent?: number,
): boolean {
  if (cancelled || generation !== currentGeneration) return false;
  return event === undefined || event === currentEvent;
}
