import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createJournalDraftWriter,
  JOURNAL_DRAFT_DEBOUNCE_MS,
  JOURNAL_DRAFT_MAX_WAIT_MS,
  type JournalDraftStorage,
} from "./journalDraft";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function memoryStorage() {
  const data = new Map<string, string>();
  const writes: string[] = [];
  const storage: JournalDraftStorage = {
    setItem: (key, value) => { writes.push(value); data.set(key, value); },
    removeItem: (key) => { data.delete(key); },
  };
  return { data, writes, storage };
}

const draft = (content: string) => ({
  date: "2026-08-29",
  title: "",
  content,
  question: "",
  answering: false,
});

describe("createJournalDraftWriter", () => {
  it("يجمع الكتابة المتتابعة في كتابة مسودة واحدة", async () => {
    const store = memoryStorage();
    const writer = createJournalDraftWriter(store.storage, "draft");

    writer.schedule(draft("كلمة"));
    writer.schedule(draft("كلمة ثانية"));
    writer.schedule(draft("كلمة ثانية ثالثة"));
    expect(store.writes).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(JOURNAL_DRAFT_DEBOUNCE_MS);
    expect(store.writes).toHaveLength(1);
    expect(JSON.parse(store.writes[0]).content).toBe("كلمة ثانية ثالثة");
  });

  it("يفرغ آخر لقطة فوراً عند الإغلاق ويحذفها بعد الحفظ الحقيقي", () => {
    const store = memoryStorage();
    const writer = createJournalDraftWriter(store.storage, "draft");

    writer.schedule(draft("لا تضيع"));
    writer.flush();
    expect(store.data.has("draft")).toBe(true);

    writer.clear();
    expect(store.data.has("draft")).toBe(false);
    writer.schedule(draft("بعد الإغلاق"));
    writer.dispose();
    expect(JSON.parse(store.writes.at(-1)!).content).toBe("بعد الإغلاق");
  });

  // التأجيل وحده يُصفَّر مع كل ضغطة: كاتبٌ متدفّق لا يسكت ٣٥٠ms كان يؤجّل
  // مسودته إلى ما لا نهاية، فلو انطفأ التبويب ضاع كلُّ ما كتبه. السقف يكتبها
  // ولو لم يتوقّف.
  it("يكتب المسودة عند سقف التأجيل ولو لم تتوقّف الكتابة", async () => {
    const store = memoryStorage();
    const writer = createJournalDraftWriter(store.storage, "draft");

    // ضغطةٌ كلَّ ٣٠٠ms — أقلُّ من التأجيل، فلا سكوت يُطلق الكتابة أبداً.
    for (let i = 1; i <= 12; i++) {
      writer.schedule(draft(`كلمة ${i}`));
      await vi.advanceTimersByTimeAsync(300);
    }
    expect(store.writes.length).toBeGreaterThanOrEqual(1);
    expect(JSON.parse(store.writes.at(-1)!).content).toMatch(/^كلمة /);

    // ولا يكتب أكثر ممّا يوجبه السقف: ١٢ ضغطة × ٣٠٠ms = ٣٦٠٠ms.
    const elapsed = 12 * 300;
    expect(store.writes.length).toBeLessThanOrEqual(Math.ceil(elapsed / JOURNAL_DRAFT_MAX_WAIT_MS) + 1);
  });
});