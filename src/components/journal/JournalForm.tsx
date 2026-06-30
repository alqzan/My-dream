"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import type { JournalEntry } from "@/lib/types";
import { MOOD_LABELS } from "@/lib/types";
import { uid, today } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

interface JournalFormProps {
  onClose: () => void;
  initial?: JournalEntry;
}

export function JournalForm({ onClose, initial }: JournalFormProps) {
  const { addJournalEntry, updateJournalEntry } = useAppStore();
  const [date, setDate] = useState(initial?.date ?? today());
  const [content, setContent] = useState(initial?.content ?? "");
  const [mood, setMood] = useState<JournalEntry["mood"]>(initial?.mood);
  const [tagInput, setTagInput] = useState(initial?.tags?.join("، ") ?? "");

  function handleSave() {
    if (!content.trim()) return;
    const tags = tagInput
      .split(/[,،]/)
      .map((t) => t.trim())
      .filter(Boolean);

    if (initial) {
      updateJournalEntry(initial.id, { date, content, mood, tags });
    } else {
      addJournalEntry({ id: uid(), date, content, mood, tags, source: "manual" });
    }
    onClose();
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">التاريخ</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-journal/40"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-2">الحال</label>
        <div className="flex gap-2 flex-wrap">
          {(Object.entries(MOOD_LABELS) as [JournalEntry["mood"], { label: string; icon: string }][]).map(
            ([key, val]) => (
              <button
                key={key}
                onClick={() => setMood(mood === key ? undefined : key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm border transition-colors ${
                  mood === key
                    ? "bg-journal/10 border-journal text-journal font-semibold"
                    : "border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                <span>{val.icon}</span>
                <span>{val.label}</span>
              </button>
            )
          )}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">ماذا في بالك اليوم؟</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={8}
          placeholder="اكتب مذكرتك هنا..."
          className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-journal/40 resize-none"
          dir="auto"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">الوسوم (مفصولة بفاصلة)</label>
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          placeholder="عمل، أسرة، أفكار..."
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-journal/40"
        />
      </div>

      <div className="flex gap-2 pt-1">
        <Button onClick={handleSave} className="flex-1">
          {initial ? "حفظ التعديلات" : "إضافة مذكرة"}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          إلغاء
        </Button>
      </div>
    </div>
  );
}
