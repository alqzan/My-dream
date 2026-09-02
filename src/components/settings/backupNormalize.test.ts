import { describe, it, expect } from "vitest";
import { embedAllMedia, normalizeBackup } from "./BackupCard";
import { mergeAppData } from "@/lib/merge";
import type { AppData, JournalEntry } from "@/lib/types";

// كلّ حقلٍ في AppData يجب أن يعبر التصدير → التطبيع → الاستعادة. `frozenHabits`
// كانت تُصدَّر ولا تُطبَّع: فالاستبدال يفكّ تجميد كلّ العادات، والدمج يترك القيمة
// وطابعها غير متوافقين.
describe("normalizeBackup — لا يسقط حقلاً من الملف", () => {
  it("يُبقي العادات المجمّدة كما صُدِّرت", () => {
    const file = { frozenHabits: ["core:reading", "h7"] } as Record<string, unknown>;
    expect(normalizeBackup(file).frozenHabits).toEqual(["core:reading", "h7"]);
  });

  it("ملفٌّ قديم بلا الحقل يُستعاد كقائمةٍ فارغة بلا خطأ", () => {
    expect(normalizeBackup({}).frozenHabits).toEqual([]);
  });

  it("الاستبدال لا يفكّ التجميد، والدمج يحترم طابع الحقل", () => {
    const restored = normalizeBackup({
      frozenHabits: ["core:reading"],
      fieldUpdatedAt: { frozenHabits: 9000 },
      lastUpdated: "2026-05-01T00:00:00.000Z",
    });
    // جهازٌ ختمُه أحدث لكنّه ضبط التجميد قبل الملف المُستعاد → يفوز الملف.
    const local: AppData = { ...restored, frozenHabits: [], fieldUpdatedAt: { frozenHabits: 100 },
      lastUpdated: "2026-05-20T00:00:00.000Z" };
    expect(mergeAppData(local, restored).frozenHabits).toEqual(["core:reading"]);
  });

  it("لا يُخرج حقلاً غير معرَّف — والنوع Required<AppData> يمنع الإغفال أصلاً", () => {
    // الضمانة الأولى ترجمةٌ لا تشغيل: `normalizeBackup` تُرجع `Required<AppData>`
    // فلا يُترجَم الملفّ حتى يُذكر كلّ حقلٍ جديد. وهذا فحصٌ مُكمِّل: ملفٌّ فارغٌ
    // تماماً يخرج منه كلّ مفتاحٍ بقيمةٍ حقيقية لا `undefined`.
    const out = normalizeBackup({}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(out)) {
      expect(v, `الحقل ${k} خرج undefined من normalizeBackup`).not.toBeUndefined();
    }
    for (const k of ["frozenHabits", "budgetWindow", "deletedMedia", "fieldUpdatedAt"]) {
      expect(Object.keys(out), `الحقل ${k} غائبٌ عن normalizeBackup`).toContain(k);
    }
  });
});

describe("نسخة PDF الاحتياطية — الملف نفسه لا الاسم وحده", () => {
  const withEntry = (entry: JournalEntry): AppData => ({
    ...normalizeBackup({}),
    journalEntries: [entry],
  });

  it("يجلب بايتات PDF من الهاش ويدمجها داخل ملف النسخة", async () => {
    const pdf = "data:application/pdf;base64,JVBERi0xLjQ=";
    const data = withEntry({
      id: "j1",
      date: "2026-08-20",
      content: "مذكرة بعقد",
      attachmentRefs: [{ kind: "pdf", filename: "عقد.pdf", hash: "pdf-hash", status: "uploaded" }],
    });

    const out = await embedAllMedia(data, () => {}, async (hash) => hash === "pdf-hash" ? pdf : null);

    expect(out.data.journalEntries[0].attachmentRefs?.[0].localData).toBe(pdf);
    expect(out.counts.pdfs).toBe(1);
    expect(out.counts.pdfFiles).toBe(1);
    expect(out.allEmbedded).toBe(true);
  });

  it("لا يدّعي الاكتمال إذا تعذّر جلب الملف، ويحفظ المرجع دون إسقاطه", async () => {
    const data = withEntry({
      id: "j2",
      date: "2026-08-20",
      content: "مذكرة قديمة",
      attachmentRefs: [{ kind: "pdf", filename: "قديم.pdf", hash: "missing", status: "uploaded" }],
    });

    const out = await embedAllMedia(data, () => {}, async () => null);

    expect(out.data.journalEntries[0].attachmentRefs?.[0]).toMatchObject({ hash: "missing", filename: "قديم.pdf" });
    expect(out.counts.pdfs).toBe(1);
    expect(out.counts.pdfFiles).toBe(0);
    expect(out.allEmbedded).toBe(false);
  });

  it("تعطّل جلب PDF واحد لا يُفشل تصدير بقية البيانات", async () => {
    const data = withEntry({
      id: "j2b",
      date: "2026-08-20",
      content: "يبقى النص سليماً",
      attachmentRefs: [{ kind: "pdf", filename: "متعذر.pdf", hash: "broken", status: "uploaded" }],
    });

    const out = await embedAllMedia(data, () => {}, async () => { throw new Error("IndexedDB unavailable"); });

    expect(out.data.journalEntries[0].content).toBe("يبقى النص سليماً");
    expect(out.data.journalEntries[0].attachmentRefs?.[0]).toMatchObject({ hash: "broken", filename: "متعذر.pdf" });
    expect(out.counts.pdfFiles).toBe(0);
    expect(out.allEmbedded).toBe(false);
  });

  it("يضمّن الملف العام بنفس مسار PDF ولا يسقط اسمه أو نوعه", async () => {
    const data = withEntry({
      id: "j2c",
      date: "2026-08-20",
      content: "مذكرة بملف",
      attachmentRefs: [{ kind: "file", filename: "مخطط.docx", hash: "docx-hash", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", status: "uploaded" }],
    });
    const bytes = "data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,AAAA";
    const out = await embedAllMedia(data, () => {}, async (hash) => hash === "docx-hash" ? bytes : null);
    expect(out.data.journalEntries[0].attachmentRefs?.[0]).toMatchObject({ kind: "file", filename: "مخطط.docx", localData: bytes });
    expect(out.counts.attachments).toBe(1);
    expect(out.counts.attachmentFiles).toBe(1);
    expect(out.allEmbedded).toBe(true);
  });

  it("الدمج بعد الاستعادة يُغني المرجع القديم ببايتات PDF ولا يكرر المرفق", () => {
    const local = withEntry({
      id: "j3",
      date: "2026-08-20",
      content: "نفس المذكرة",
      attachmentRefs: [{ kind: "pdf", filename: "ملف.pdf", hash: "h1", status: "uploaded" }],
    });
    const restored = withEntry({
      id: "j3",
      date: "2026-08-20",
      content: "نفس المذكرة",
      attachmentRefs: [{
        kind: "pdf",
        filename: "ملف.pdf",
        hash: "h1",
        status: "uploaded",
        localData: "data:application/pdf;base64,JVBERg==",
      }],
    });

    const merged = mergeAppData(local, restored);
    expect(merged.journalEntries[0].attachmentRefs).toHaveLength(1);
    expect(merged.journalEntries[0].attachmentRefs?.[0].localData).toMatch(/^data:application\/pdf/);
  });
});
