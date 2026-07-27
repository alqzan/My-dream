import { describe, it, expect } from "vitest";
import { normalizeBackup } from "./BackupCard";
import { mergeAppData } from "@/lib/merge";
import type { AppData } from "@/lib/types";

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
    for (const k of ["assets", "installmentPlans", "frozenHabits", "budgetWindow", "deletedMedia", "fieldUpdatedAt"]) {
      expect(Object.keys(out), `الحقل ${k} غائبٌ عن normalizeBackup`).toContain(k);
    }
  });
});
