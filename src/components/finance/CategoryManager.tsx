"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { uid, getSubCategories, cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Plus, Trash2, CornerDownLeft } from "lucide-react";

const ICONS = ["🧺", "✨", "📊", "🤲", "🎁", "🏠", "🚗", "🍽️", "❤️", "📚", "✈️", "🏦", "💊", "🎓", "👶", "🐾", "🎮", "📱", "⚡", "📌"];
const COLORS = ["#e07b39", "#9b6fcd", "#256128", "#1f7a6c", "#4a9fbd", "#e05555", "#dc9f3c", "#7c6fcd"];

function firstGrapheme(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    for (const s of seg.segment(trimmed)) return s.segment;
  }
  return [...trimmed][0] ?? "";
}

// Two levels of categories: أقسام رئيسية (the top row everywhere) and
// أقسام فرعية تحتها تكتبها بنفسك — مثلا "أساسيات" وتحتها "بنزين" و"فواتير".
// Totals/budgets roll up to the main; the sub is the drill-down detail.
// Deleting a category never deletes its transactions — they show as
// "غير مصنف" (or roll up to the main if only the sub was deleted).
export function CategoryManager({ onClose }: { onClose: () => void }) {
  const { categories, addCategory, deleteCategory } = useAppStore();
  const [addingMain, setAddingMain] = useState(false);
  const [addingSubFor, setAddingSubFor] = useState<string | null>(null);

  const mains = categories.filter((c) => !c.parentId);

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-gray-400 leading-relaxed bg-gray-50 rounded-xl px-3 py-2">
        القسم <strong className="text-gray-600">الرئيسي</strong> يظهر في كل التقارير، وتحته
        أقسام <strong className="text-gray-600">فرعية</strong> تفصيلية تكتب فيها اللي تبي —
        اضغط «فرعي +» تحت أي قسم.
      </p>

      <div className="space-y-2.5">
        {mains.map((main) => {
          const subs = getSubCategories(categories, main.id);
          return (
            <div key={main.id} className="bg-white border border-gray-100 rounded-xl overflow-hidden">
              {/* Main category row */}
              <div className="flex items-center gap-3 p-3" style={{ borderRight: `3px solid ${main.color}` }}>
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                  style={{ backgroundColor: main.color + "18" }}
                >
                  {main.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-gray-800">{main.label}</span>
                  <span className="text-[10px] text-gray-400">
                    قسم رئيسي{subs.length > 0 ? ` · ${subs.length} فرعي` : ""}
                  </span>
                </div>
                <button
                  onClick={() => setAddingSubFor(addingSubFor === main.id ? null : main.id)}
                  className={cn(
                    "text-[10px] font-bold rounded-lg px-2 py-1.5 press shrink-0",
                    addingSubFor === main.id ? "bg-finance text-white" : "bg-finance/10 text-finance"
                  )}
                >
                  فرعي +
                </button>
                <button
                  onClick={() => deleteCategory(main.id)}
                  disabled={mains.length <= 1}
                  title={mains.length <= 1 ? "لازم يبقى قسم رئيسي واحد على الأقل" : "حذف"}
                  className="p-1.5 text-gray-300 hover:text-red-400 rounded-lg disabled:opacity-30 disabled:hover:text-gray-300 shrink-0"
                >
                  <Trash2 size={15} />
                </button>
              </div>

              {/* Sub categories */}
              {(subs.length > 0 || addingSubFor === main.id) && (
                <div className="bg-gray-50/70 px-3 pb-2.5 pt-1 space-y-1.5">
                  {subs.map((sub) => (
                    <div key={sub.id} className="flex items-center gap-2 pr-4">
                      <CornerDownLeft size={12} className="text-gray-300 shrink-0 scale-x-[-1]" />
                      <span className="w-6 h-6 rounded-lg bg-white flex items-center justify-center text-xs shrink-0">
                        {sub.icon}
                      </span>
                      <span className="flex-1 text-xs font-medium text-gray-600">{sub.label}</span>
                      <button
                        onClick={() => deleteCategory(sub.id)}
                        className="p-1 text-gray-300 hover:text-red-400 rounded-lg"
                        aria-label={`حذف ${sub.label}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                  {addingSubFor === main.id && (
                    <CategoryForm
                      compact
                      accentColor={main.color}
                      onSubmit={(label, icon, color) => {
                        addCategory({ id: uid(), label, icon, color, parentId: main.id });
                        setAddingSubFor(null);
                      }}
                      onCancel={() => setAddingSubFor(null)}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {addingMain ? (
        <CategoryForm
          onSubmit={(label, icon, color) => {
            addCategory({ id: uid(), label, icon, color });
            setAddingMain(false);
          }}
          onCancel={() => setAddingMain(false)}
        />
      ) : (
        <Button onClick={() => setAddingMain(true)} variant="secondary" className="w-full gap-1.5">
          <Plus size={16} /> قسم رئيسي جديد
        </Button>
      )}

      <Button onClick={onClose} className="w-full">تم</Button>
    </div>
  );
}

function CategoryForm({
  onSubmit,
  onCancel,
  compact,
  accentColor,
}: {
  onSubmit: (label: string, icon: string, color: string) => void;
  onCancel: () => void;
  compact?: boolean;
  accentColor?: string;
}) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(ICONS[0]);
  const [color, setColor] = useState(accentColor ?? COLORS[0]);

  function handleAdd() {
    if (!name.trim()) return;
    onSubmit(name.trim(), icon, color);
  }

  return (
    <div className={cn("rounded-xl space-y-2.5", compact ? "bg-white border border-gray-100 p-2.5" : "bg-gray-50 p-3")}>
      <div className="flex items-center gap-2">
        <span className="w-9 h-9 shrink-0 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-lg">
          {icon}
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={compact ? "اسم القسم الفرعي (بنزين، فواتير...)" : "اسم القسم الرئيسي"}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-finance/40"
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          autoFocus
        />
      </div>
      <div className="flex gap-1 flex-wrap items-center">
        {ICONS.slice(0, compact ? 10 : ICONS.length).map((ic) => (
          <button
            key={ic}
            onClick={() => setIcon(ic)}
            className={`text-base p-1 rounded-lg ${icon === ic ? "bg-finance/10 ring-1 ring-finance" : "hover:bg-gray-200"}`}
          >
            {ic}
          </button>
        ))}
        <input
          value=""
          onChange={(e) => {
            const emoji = firstGrapheme(e.target.value);
            if (emoji) setIcon(emoji);
          }}
          placeholder="أو أي إيموجي"
          className="w-20 text-[11px] border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-finance/40"
          aria-label="إيموجي مخصص"
        />
      </div>
      {!compact && (
        <div className="flex gap-1.5 flex-wrap">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-6 h-6 rounded-full ${color === c ? "ring-2 ring-offset-1 ring-gray-400" : ""}`}
              style={{ backgroundColor: c }}
              aria-label={c}
            />
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Button onClick={handleAdd} className="flex-1 bg-finance hover:bg-finance/90" size="sm">إضافة</Button>
        <Button variant="secondary" size="sm" onClick={onCancel}>إلغاء</Button>
      </div>
    </div>
  );
}
