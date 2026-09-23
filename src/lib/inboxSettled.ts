import type { InboxDecision } from "./types";

// ===== وارِدٌ حُسم محلياً ولم يُحذف من السحابة =====
// اعتمادُ رسالة بنك خطوتان: حفظُ القرار محلياً ثمّ حذفُ وثيقة الوارد. إن فشل
// الحفظ (IndexedDB على iOS بعد التعليق) تبقى الوثيقة عمداً — ثمّ ينجح الإفراغُ
// المؤجّل لاحقاً فيصير القرارُ على القرص والوثيقةُ ما زالت هناك، فتعود المراجعةُ
// نفسُها عند كلّ إقلاع. هذا يحدّد ما يُكمَل حذفُه بلا سؤال: كلُّ حدثٍ في الوثيقة
// له قرارٌ نهائيّ، ولا حدثَ فيها بتلميح التزامٍ لم يُتجاهل — المراجعةُ نفسُها
// تُبقي تلك الوثيقة (`hasDeferredHint` في `PendingImport.tsx`).

const TERMINAL = new Set<InboxDecision["decision"]>(["saved", "matched", "ignored", "duplicate"]);

export interface InboxItemEvents {
  id: string;
  events: { eventId?: string; obligationHint?: unknown }[];
}

export function settledInboxItemIds(items: InboxItemEvents[], decisions: InboxDecision[]): Set<string> {
  const byEvent = new Map(decisions.map((d) => [d.eventId, d.decision]));
  const settled = new Set<string>();
  for (const item of items) {
    if (!item.events.length) continue;
    const done = item.events.every((event) => {
      const decision = event.eventId ? byEvent.get(event.eventId) : undefined;
      if (!decision || !TERMINAL.has(decision)) return false;
      return !event.obligationHint || decision === "ignored";
    });
    if (done) settled.add(item.id);
  }
  return settled;
}
