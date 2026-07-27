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

  it("يغطّي كلّ مفاتيح AppData التي يحملها الملف", () => {
    const keys = Object.keys(normalizeBackup({}));
    for (const k of ["assets", "installmentPlans", "frozenHabits", "budgetWindow", "deletedMedia", "fieldUpdatedAt"]) {
      expect(keys, `الحقل ${k} غائبٌ عن normalizeBackup`).toContain(k);
    }
  });
});
