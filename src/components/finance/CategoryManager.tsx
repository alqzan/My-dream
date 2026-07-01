"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { uid } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Plus, Trash2 } from "lucide-react";

const ICONS = ["🧺", "✨", "📊", "🤲", "🎁", "🏠", "🚗", "🍽️", "❤️", "📚", "✈️", "🏦", "💊", "🎓", "👶", "🐾", "🎮", "📱", "⚡", "📌"];
const COLORS = ["#e07b39", "#9b6fcd", "#256128", "#1f7a6c", "#4a9fbd", "#e05555", "#dc9f3c", "#7c6fcd"];

// Categories are entirely yours — add whatever you track, delete whatever
// you don't. Existing transactions never disappear; a deleted category's
// past entries just show as "غير مصنف" instead of vanishing.
export function CategoryManager({ onClose }: { onClose: () => void }) {
  const { categories, addCategory, deleteCategory } = useAppStore();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(ICONS[0]);
  const [color, setColor] = useState(COLORS[0]);

  function handleAdd() {
    if (!name.trim()) return;
    addCategory({ id: uid(), label: name.trim(), icon, color });
    setName("");
    setAdding(false);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {categories.map((c) => (
          <div key={c.id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl p-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
              style={{ backgroundColor: c.color + "15" }}
            >
              {c.icon}
            </div>
            <span className="flex-1 text-sm font-semibold text-gray-700">{c.label}</span>
            <button
              onClick={() => deleteCategory(c.id)}
              disabled={categories.length <= 1}
              title={categories.length <= 1 ? "لازم يبقى تصنيف واحد على الأقل" : "حذف"}
              className="p-1.5 text-gray-300 hover:text-red-400 rounded-lg disabled:opacity-30 disabled:hover:text-gray-300"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      {adding ? (
        <div className="bg-gray-50 rounded-xl p-3 space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="اسم التصنيف"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-finance/40"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <div className="flex gap-1 flex-wrap">
            {ICONS.map((ic) => (
              <button
                key={ic}
                onClick={() => setIcon(ic)}
                className={`text-lg p-1.5 rounded-lg ${icon === ic ? "bg-finance/10 ring-1 ring-finance" : "hover:bg-gray-200"}`}
              >
                {ic}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-6 h-6 rounded-full ${color === c ? "ring-2 ring-offset-1 ring-gray-400" : ""}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <Button onClick={handleAdd} className="flex-1 bg-finance hover:bg-finance/90" size="sm">إضافة</Button>
            <Button variant="secondary" size="sm" onClick={() => setAdding(false)}>إلغاء</Button>
          </div>
        </div>
      ) : (
        <Button onClick={() => setAdding(true)} variant="secondary" className="w-full gap-1.5">
          <Plus size={16} /> تصنيف جديد
        </Button>
      )}

      <Button onClick={onClose} className="w-full">تم</Button>
    </div>
  );
}
