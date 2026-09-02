"use client";

import { Eye, EyeOff, LayoutList, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/Card";
import {
  FINANCE_DISPLAY_LABELS,
  readFinanceDisplayVisibility,
  saveFinanceDisplayVisibility,
  isFinanceDisplayVisible,
  type FinanceDisplayId,
  type FinanceDisplayVisibility,
} from "@/lib/financePreferences";
import { useEffect, useState } from "react";

const GROUPS: Array<{ title: string; ids: FinanceDisplayId[] }> = [
  { title: "ملخص الدورة", ids: ["curve", "cycle", "budgets"] },
  { title: "أدوات المال", ids: ["daily", "reserves", "history"] },
];

export function FinanceDisplayCard() {
  const [visibility, setVisibility] = useState<FinanceDisplayVisibility>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setVisibility(readFinanceDisplayVisibility());
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) saveFinanceDisplayVisibility(visibility);
  }, [ready, visibility]);

  function toggle(id: FinanceDisplayId) {
    setVisibility((current) => ({
      ...current,
      [id]: !isFinanceDisplayVisible(current, id),
    }));
  }

  function showAll() {
    setVisibility({});
  }

  return (
    <Card className="mdr-finance-display-card">
      <div className="mdr-theme-card-head">
        <LayoutList size={17} />
        <div>
          <div className="mdr-theme-card-title">عرض صفحة المال</div>
          <p className="mdr-theme-card-copy">
            اختر الأقسام التي تحتاجها أمامك. الإخفاء من العرض فقط؛ لا يحذف بياناتك ولا يلغي الأداة أو مزامنتها.
          </p>
        </div>
      </div>

      {GROUPS.map((group) => (
        <div key={group.title} className="mdr-finance-display-group">
          <div className="mdr-theme-group-label">
            <span>{group.title}</span>
            <span>{group.ids.filter((id) => isFinanceDisplayVisible(visibility, id)).length} من {group.ids.length} ظاهر</span>
          </div>
          <div className="mdr-finance-display-list">
            {group.ids.map((id) => {
              const shown = isFinanceDisplayVisible(visibility, id);
              const label = FINANCE_DISPLAY_LABELS[id];
              return (
                <button
                  key={id}
                  type="button"
                  className={`mdr-finance-display-row ${shown ? "is-visible" : "is-hidden"}`}
                  aria-pressed={shown}
                  onClick={() => toggle(id)}
                >
                  <span className="mdr-finance-display-icon" aria-hidden="true">
                    {shown ? <Eye size={15} /> : <EyeOff size={15} />}
                  </span>
                  <span className="mdr-finance-display-copy">
                    <strong>{label.title}</strong>
                    <small>{label.description}</small>
                  </span>
                  <span className="mdr-finance-display-state">{shown ? "ظاهر" : "مخفي"}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="mdr-finance-display-foot">
        <span>تقدر ترجع كل الأقسام بضغطة واحدة.</span>
        <button type="button" className="mdr-theme-reset inline-flex items-center gap-1.5" onClick={showAll}>
          <RotateCcw size={12} /> إظهار الكل
        </button>
      </div>
      <p className="mdr-theme-note">هذا ترتيب عرض على جهازك فقط، ولا يؤثر على الأجهزة الأخرى أو على البيانات المتزامنة.</p>
    </Card>
  );
}
