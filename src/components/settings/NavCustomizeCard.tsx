"use client";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { NAV_ITEMS } from "@/lib/nav";
import { loadNavPrefs, saveNavPrefs, clearNavPrefs, sanitizeNavPrefs, MAX_PRIMARY_ITEMS } from "@/lib/navPrefs";
import { showToast } from "@/components/ui/UndoToast";
import { LayoutGrid, ArrowUp, ArrowDown, Plus, X, RotateCcw } from "lucide-react";

// «تخصيص التنقّل»: حتى 5 أقسامٍ أساسية تظهر مباشرةً في الشريط
// الجانبي وشريط الجوّال، والباقي تحت «المزيد» — بلا حذف أي قسم ولا بيانات.
// الجهاز غير المخصص يأخذ خمسة أبواب التصميم افتراضيًا. التغيير يحتاج إعادة
// تحميل الصفحة ليسري — نفس نمط بطاقة مفتاح
// المزامنة (SyncKeyCard) بالضبط.
export function NavCustomizeCard() {
  const [selected, setSelected] = useState<string[]>(() => loadNavPrefs() ?? []);
  const isCustomized = selected.length > 0;
  const rest = NAV_ITEMS.filter((i) => !selected.includes(i.href));

  function add(href: string) {
    if (selected.length >= MAX_PRIMARY_ITEMS) return;
    setSelected((s) => sanitizeNavPrefs([...s, href], NAV_ITEMS));
  }
  function remove(href: string) {
    setSelected((s) => s.filter((h) => h !== href));
  }
  function move(index: number, dir: -1 | 1) {
    setSelected((s) => {
      const next = [...s];
      const j = index + dir;
      if (j < 0 || j >= next.length) return s;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }

  function save() {
    saveNavPrefs(selected, NAV_ITEMS);
    showToast(
      selected.length ? "حُفظ ترتيب التنقّل — يُطبَّق بعد إعادة التحميل" : "أُعيد التنقّل للوضع الافتراضي",
      "success"
    );
    location.reload();
  }

  function reset() {
    clearNavPrefs();
    setSelected([]);
    showToast("عاد التنقّل للوضع الافتراضي — خمسة أبواب والباقي تحت المزيد", "success");
    location.reload();
  }

  const labelOf = (href: string) => NAV_ITEMS.find((i) => i.href === href)?.label ?? href;
  const iconOf = (href: string) => NAV_ITEMS.find((i) => i.href === href)?.icon;

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <LayoutGrid size={16} className="text-brand-600" />
        <span className="text-sm font-semibold text-gray-700">تخصيص التنقّل</span>
      </div>
      <p className="text-xs text-gray-400 leading-relaxed mb-3">
        اختر حتى {MAX_PRIMARY_ITEMS} أقسامٍ تظهر مباشرةً في الشريط، ورتّبها كما تحب — والباقي
        يظهر تحت «المزيد». هذا الجهاز فقط، ولا يحذف أي قسم أو بيانات.
      </p>

      {isCustomized && (
        <div className="space-y-1.5 mb-3">
          {selected.map((href, i) => {
            const Icon = iconOf(href);
            return (
              <div key={href} className="flex items-center gap-2 bg-gray-50 dark:bg-white/5 rounded-xl px-2.5 py-2">
                <span className="text-xs font-mono text-gray-400 w-4 shrink-0">{i + 1}</span>
                {Icon && <Icon size={16} className="shrink-0 text-gray-500" />}
                <span className="flex-1 min-w-0 text-sm text-gray-700 dark:text-gray-200 truncate">{labelOf(href)}</span>
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="أعلى"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 disabled:opacity-30 press"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === selected.length - 1}
                  aria-label="أسفل"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 disabled:opacity-30 press"
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => remove(href)}
                  aria-label={`إزالة ${labelOf(href)}`}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-red-400 press"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {rest.length > 0 && selected.length < MAX_PRIMARY_ITEMS && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {rest.map((item) => (
            <button
              key={item.href}
              type="button"
              onClick={() => add(item.href)}
              className="flex items-center gap-1 text-xs font-medium text-gray-600 bg-gray-50 dark:bg-white/5 rounded-full pe-2.5 ps-1.5 py-1.5 min-h-[36px] press"
            >
              <Plus size={12} /> {item.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 text-sm font-medium text-brand-600 bg-brand-50 rounded-xl px-3 press"
        >
          حفظ
        </button>
        {isCustomized && (
          <button
            type="button"
            onClick={reset}
            className="min-h-[44px] flex items-center gap-1.5 text-xs text-gray-500 px-3 press"
          >
            <RotateCcw size={13} /> افتراضي
          </button>
        )}
      </div>
    </Card>
  );
}
