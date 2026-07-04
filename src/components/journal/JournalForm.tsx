"use client";
import { useMemo, useState } from "react";
import { useAppStore } from "@/lib/store";
import type { JournalEntry } from "@/lib/types";
import { uid, today, parseDate } from "@/lib/utils";
import { compressImage, estimateSize } from "@/lib/imageUtils";
import { dailyQuestion, randomQuestion, QUESTION_LIBRARY } from "@/lib/questions";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Camera, Image as ImageIcon, X, Loader2, RefreshCw, Library, Sparkles } from "lucide-react";

interface JournalFormProps {
  onClose: () => void;
  initial?: JournalEntry;
}

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// كتابة /الوقت (أو /وقت) داخل النص تستبدل مباشرة بالوقت الحالي HH:MM
function expandTimeCommand(text: string): string {
  return text.replace(/\/(?:الوقت|وقت|time)/g, nowHHMM());
}

const WEEKDAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function suggestTitles(content: string, dateStr: string, question?: string): string[] {
  const suggestions: string[] = [];

  // من أول سطر مكتوب
  const firstLine = content.split("\n").find((l) => l.trim().length > 3)?.trim();
  if (firstLine) {
    const words = firstLine.split(/\s+/).slice(0, 5).join(" ");
    suggestions.push(words.length < firstLine.length ? `${words}…` : words);
  }

  // من سؤال اليوم
  if (question) {
    const qWords = question.replace(/[؟?]/g, "").split(/\s+/).slice(0, 4).join(" ");
    suggestions.push(`عن: ${qWords}…`);
  }

  const d = parseDate(dateStr);
  suggestions.push(`خواطر ${WEEKDAYS[d.getDay()]}`);
  suggestions.push(`صفحة من دفتر ${d.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { month: "long" })}`);

  return [...new Set(suggestions)].slice(0, 4);
}

export function JournalForm({ onClose, initial }: JournalFormProps) {
  const { addJournalEntry, updateJournalEntry } = useAppStore();
  const [date, setDate] = useState(initial?.date ?? today());
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [question, setQuestion] = useState(initial?.question ?? dailyQuestion(today()));
  const [answering, setAnswering] = useState(!!initial?.question);
  const [showLibrary, setShowLibrary] = useState(false);
  const [photo, setPhoto] = useState<string | undefined>(initial?.photo);
  const [photoSize, setPhotoSize] = useState("");
  const [compressing, setCompressing] = useState(false);

  const titleIdeas = useMemo(
    () => suggestTitles(content, date, answering ? question : undefined),
    [content, date, question, answering]
  );

  async function handlePhotoFile(file: File) {
    setCompressing(true);
    try {
      const compressed = await compressImage(file, 200);
      setPhoto(compressed);
      setPhotoSize(estimateSize(compressed));
    } finally {
      setCompressing(false);
    }
  }

  function handleSave() {
    if (!content.trim() && !title.trim()) return;

    if (initial) {
      // قيم فارغة (وليست undefined) حتى تُمسح الحقول فعلاً عند إزالتها
      // ولا يرى تزامن Firestore قيم undefined.
      updateJournalEntry(initial.id, {
        date,
        title: title.trim(),
        content: content.trim(),
        question: answering ? question : "",
        photo: photo ?? "",
      });
    } else {
      addJournalEntry({
        id: uid(),
        date,
        title: title.trim(),
        content: content.trim(),
        ...(answering ? { question } : {}),
        ...(photo ? { photo } : {}),
        time: nowHHMM(),
        source: "manual",
      });
    }
    onClose();
  }

  return (
    <div className="space-y-4">
      {/* العنوان — كبير وغامق في الأعلى */}
      <div>
        <input
          value={title}
          onChange={(e) => setTitle(expandTimeCommand(e.target.value))}
          placeholder="عنوان اليوم ✨"
          dir="auto"
          className="w-full text-xl font-black border-0 border-b-2 border-gray-100 focus:border-journal bg-transparent px-1 py-2 focus:outline-none placeholder:text-gray-300 placeholder:font-bold"
        />
        {!title && titleIdeas.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mt-2">
            <Sparkles size={13} className="text-journal mt-1" />
            {titleIdeas.map((t) => (
              <button
                key={t}
                onClick={() => setTitle(t)}
                className="text-[11px] bg-journal/10 text-journal px-2.5 py-1 rounded-full hover:bg-journal/20 transition-colors press"
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">التاريخ</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-journal/40"
        />
      </div>

      {/* سؤال اليوم */}
      <div className={`rounded-2xl p-3.5 border transition-colors ${answering ? "bg-journal/10 border-journal/40" : "bg-gray-50 border-gray-100"}`}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-bold text-journal">سؤال اليوم 💭</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setQuestion(randomQuestion(question))}
              className="p-1.5 text-gray-400 hover:text-journal rounded-lg press"
              title="سؤال آخر"
            >
              <RefreshCw size={13} />
            </button>
            <button
              onClick={() => setShowLibrary(true)}
              className="p-1.5 text-gray-400 hover:text-journal rounded-lg press"
              title="مكتبة الأسئلة"
            >
              <Library size={14} />
            </button>
          </div>
        </div>
        <p className="text-sm text-gray-700 leading-relaxed font-medium">{question}</p>
        <button
          onClick={() => setAnswering(!answering)}
          className={`mt-2 text-xs font-bold px-3 py-1.5 rounded-full transition-colors press ${
            answering
              ? "bg-journal text-white"
              : "bg-white border border-gray-200 text-gray-500 hover:border-journal/40"
          }`}
        >
          {answering ? "أكتب عنه ✓" : "✍️ أجب عليه"}
        </button>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">
          ماذا في بالك اليوم؟
          <span className="text-gray-300 font-normal"> — اكتب /الوقت لإدراج الساعة</span>
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(expandTimeCommand(e.target.value))}
          rows={8}
          placeholder="اكتب مذكرتك هنا..."
          className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-journal/40 resize-none"
          dir="auto"
        />
      </div>

      {/* الصورة: من الكاميرا أو من الاستديو — تُضغط تلقائياً */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-2">صورة اليوم</label>
        {photo ? (
          <div className="relative">
            <img src={photo} alt="صورة اليوم" className="w-full h-44 object-cover rounded-xl" />
            {photoSize && (
              <div className="absolute bottom-2 right-2 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full">
                {photoSize} بعد الضغط
              </div>
            )}
            <button
              onClick={() => setPhoto(undefined)}
              className="absolute top-2 left-2 bg-black/50 text-white p-1 rounded-full hover:bg-red-500/80 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        ) : compressing ? (
          <div className="flex items-center justify-center h-24 border-2 border-dashed border-gray-200 rounded-xl">
            <Loader2 size={22} className="text-gray-400 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col items-center justify-center h-24 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-journal/40 transition-colors press">
              <Camera size={20} className="text-gray-400 mb-1" />
              <span className="text-xs text-gray-400">التقط صورة</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoFile(f); }}
              />
            </label>
            <label className="flex flex-col items-center justify-center h-24 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-journal/40 transition-colors press">
              <ImageIcon size={20} className="text-gray-400 mb-1" />
              <span className="text-xs text-gray-400">من الاستديو</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoFile(f); }}
              />
            </label>
          </div>
        )}
        {!photo && !compressing && (
          <p className="text-[10px] text-gray-300 mt-1 text-center">أي صورة تُضغط تلقائياً لتوفير المساحة</p>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <Button onClick={handleSave} className="flex-1 bg-journal hover:bg-journal/90">
          {initial ? "حفظ التعديلات" : "إضافة مذكرة"}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          إلغاء
        </Button>
      </div>

      {/* مكتبة الأسئلة */}
      <Modal open={showLibrary} onClose={() => setShowLibrary(false)} title="مكتبة الأسئلة 📚" className="sm:max-w-2xl">
        <QuestionLibrary
          onPick={(q) => { setQuestion(q); setAnswering(true); setShowLibrary(false); }}
        />
      </Modal>
    </div>
  );
}

export function QuestionLibrary({ onPick }: { onPick: (q: string) => void }) {
  const [openCat, setOpenCat] = useState<string | null>(QUESTION_LIBRARY[0].name);

  return (
    <div className="space-y-2">
      {QUESTION_LIBRARY.map((cat) => (
        <div key={cat.name} className="border border-gray-100 rounded-xl overflow-hidden">
          <button
            onClick={() => setOpenCat(openCat === cat.name ? null : cat.name)}
            className="w-full flex items-center gap-2 px-3.5 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <span className="text-lg">{cat.icon}</span>
            <span className="text-sm font-bold text-gray-700 flex-1 text-right">{cat.name}</span>
            <span className="text-[11px] text-gray-400">{cat.questions.length} سؤال</span>
          </button>
          {openCat === cat.name && (
            <div className="divide-y divide-gray-50">
              {cat.questions.map((q) => (
                <button
                  key={q}
                  onClick={() => onPick(q)}
                  className="w-full text-right text-sm text-gray-600 px-4 py-2.5 hover:bg-journal/5 hover:text-journal transition-colors leading-relaxed"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
