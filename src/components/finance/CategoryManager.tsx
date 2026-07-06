"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { uid, getSubCategories, cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Plus, Trash2, CornerDownLeft, Pencil, ChevronUp, ChevronDown } from "lucide-react";

const ICONS = ["🧺", "✨", "📊", "🤲", "🎁", "🏠", "🚗", "🍽️", "☕", "❤️", "📚", "✈️", "🏦", "💊", "🎓", "👶", "🐾", "🎮", "📱", "⚡", "🧾", "📌"];
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

// Small up/down reorder control. Disabled at the ends of the sibling list.
function Reorder({ onUp, onDown, first, last }: { onUp: () => void; onDown: () => void; first: boolean; last: boolean }) {
  return (
    <div className="flex flex-col shrink-0">
      <button onClick={onUp} disabled={first} aria-label="تحريك لأعلى"
        className="text-gray-300 hover:text-gray-500 disabled:opacity-25 disabled:hover:text-gray-300 leading-none">
        <ChevronUp size={14} />
      </button>
      <button onClick={onDown} disabled={last} aria-label="تحريك لأسفل"
        className="text-gray-300 hover:text-gray-500 disabled:opacity-25 disabled:hover:text-gray-300 leading-none">
        <ChevronDown size={14} />
      </button>
    </div>
  );
}

// Two levels of categories: أقسام رئيسية (the top row everywhere) and
// أقسام فرعية تحتها تكتبها بنفسك. Totals/budgets roll up to the main; the sub
// is the drill-down detail. Everything here is editable, reorderable, and a
// sub can be moved between the sections that allow subs.
// Deleting a category never deletes its transactions — they show as
// "غير مصنف" (or roll up to the main if only the sub was deleted).
export function CategoryManager({ onClose }: { onClose: () => void }) {
  const { categories, addCategory, updateCategory, deleteCategory, moveCategory } = useAppStore();
  const [addingMain, setAddingMain] = useState(false);
  const [addingSubFor, setAddingSubFor] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const mains = categories.filter((c) => !c.parentId);
  const subTargets = mains.filter((m) => m.allowSubs);

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-gray-400 leading-relaxed bg-gray-50 rounded-xl px-3 py-2">
        القسم <strong className="text-gray-600">الرئيسي</strong> يظهر في كل التقارير، وتحته
        أقسام <strong className="text-gray-600">فرعية</strong> تفصيلية. تقدر تعدّل أي قسم (قلم)،
        ترتّبه (الأسهم)، أو تنقل الفرعي بين الأساسيات والكماليات.
      </p>

      <div className="space-y-2.5">
        {mains.map((main, mi) => {
          const subs = getSubCategories(categories, main.id);
          return (
            <div key={main.id} className="bg-white border border-gray-100 rounded-xl overflow-hidden">
              {/* Main category row (or its edit form) */}
              {editingId === main.id ? (
                <div className="p-2.5">
                  <CategoryForm
                    initial={{ label: main.label, icon: main.icon, color: main.color }}
                    onSubmit={(label, icon, color) => {
                      updateCategory(main.id, { label, icon, color });
                      setEditingId(null);
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3" style={{ borderRight: `3px solid ${main.color}` }}>
                  <Reorder
                    first={mi === 0}
                    last={mi === mains.length - 1}
                    onUp={() => moveCategory(main.id, -1)}
                    onDown={() => moveCategory(main.id, 1)}
                  />
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
                    style={{ backgroundColor: main.color + "18" }}>
                    {main.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-gray-800 truncate">{main.label}</span>
                    <span className="text-[10px] text-gray-400">
                      قسم رئيسي{subs.length > 0 ? ` · ${subs.length} فرعي` : ""}
                    </span>
                  </div>
                  {main.allowSubs && (
                    <button
                      onClick={() => setAddingSubFor(addingSubFor === main.id ? null : main.id)}
                      className={cn(
                        "text-[10px] font-bold rounded-lg px-2 py-1.5 press shrink-0",
                        addingSubFor === main.id ? "bg-finance text-white" : "bg-finance/10 text-finance"
                      )}
                    >
                      فرعي +
                    </button>
                  )}
                  <button onClick={() => { setEditingId(main.id); setAddingSubFor(null); }}
                    className="p-1.5 text-gray-300 hover:text-finance rounded-lg shrink-0" aria-label={`تعديل ${main.label}`}>
                    <Pencil size={14} />
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
              )}

              {/* Sub categories */}
              {(subs.length > 0 || addingSubFor === main.id) && (
                <div className="bg-gray-50/70 px-3 pb-2.5 pt-1 space-y-1.5">
                  {subs.map((sub, si) =>
                    editingId === sub.id ? (
                      <div key={sub.id} className="pr-4">
                        <CategoryForm
                          compact
                          initial={{ label: sub.label, icon: sub.icon, color: sub.color }}
                          onSubmit={(label, icon, color) => {
                            updateCategory(sub.id, { label, icon, color });
                            setEditingId(null);
                          }}
                          onCancel={() => setEditingId(null)}
                        />
                      </div>
                    ) : (
                      <div key={sub.id} className="flex items-center gap-1.5 pr-3">
                        <Reorder
                          first={si === 0}
                          last={si === subs.length - 1}
                          onUp={() => moveCategory(sub.id, -1)}
                          onDown={() => moveCategory(sub.id, 1)}
                        />
                        <CornerDownLeft size={12} className="text-gray-300 shrink-0 scale-x-[-1]" />
                        <span className="w-6 h-6 rounded-lg bg-white flex items-center justify-center text-xs shrink-0">
                          {sub.icon}
                        </span>
                        <span className="flex-1 min-w-0 text-xs font-medium text-gray-600 truncate">{sub.label}</span>
                        {subTargets.length > 1 && (
                          <select
                            value={main.id}
                            onChange={(e) => updateCategory(sub.id, { parentId: e.target.value })}
                            className="text-[10px] text-gray-500 bg-white border border-gray-200 rounded-lg py-1 px-1 shrink-0 max-w-[74px] focus:outline-none focus:ring-1 focus:ring-finance/40"
                            aria-label={`نقل ${sub.label} إلى قسم آخر`}
                            title="نقل إلى قسم"
                          >
                            {subTargets.map((t) => (
                              <option key={t.id} value={t.id}>{t.icon} {t.label}</option>
                            ))}
                          </select>
                        )}
                        <button onClick={() => setEditingId(sub.id)}
                          className="p-1 text-gray-300 hover:text-finance rounded-lg shrink-0" aria-label={`تعديل ${sub.label}`}>
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => deleteCategory(sub.id)}
                          className="p-1 text-gray-300 hover:text-red-400 rounded-lg shrink-0"
                          aria-label={`حذف ${sub.label}`}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )
                  )}
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
  initial,
}: {
  onSubmit: (label: string, icon: string, color: string) => void;
  onCancel: () => void;
  compact?: boolean;
  accentColor?: string;
  initial?: { label: string; icon: string; color: string };
}) {
  const [name, setName] = useState(initial?.label ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? ICONS[0]);
  const [color, setColor] = useState(initial?.color ?? accentColor ?? COLORS[0]);
  const editing = !!initial;

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
          placeholder={compact ? "اسم القسم الفرعي (بنزين، قهوة...)" : "اسم القسم الرئيسي"}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-finance/40"
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          autoFocus
        />
      </div>
      <div className="flex gap-1 flex-wrap items-center">
        {ICONS.slice(0, compact ? 12 : ICONS.length).map((ic) => (
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
      {(!compact || editing) && (
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
        <Button onClick={handleAdd} className="flex-1 bg-finance hover:bg-finance/90" size="sm">
          {editing ? "حفظ" : "إضافة"}
        </Button>
        <Button variant="secondary" size="sm" onClick={onCancel}>إلغاء</Button>
      </div>
    </div>
  );
}
