"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import type { JournalEntry } from "@/lib/types";
import { uid, today, parseDate } from "@/lib/utils";
import { compressImage } from "@/lib/imageUtils";
import { dailyQuestion, randomQuestion, QUESTION_LIBRARY } from "@/lib/questions";
import { AudioRecorder } from "./AudioRecorder";
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

const DRAFT_KEY = "madar-journal-draft";

export function JournalForm({ onClose, initial }: JournalFormProps) {
  const { addJournalEntry, updateJournalEntry } = useAppStore();
  const [date, setDate] = useState(initial?.date ?? today());
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [question, setQuestion] = useState(initial?.question ?? dailyQuestion(today()));
  const [answering, setAnswering] = useState(!!initial?.question);
  const [showLibrary, setShowLibrary] = useState(false);
  const [photos, setPhotos] = useState<string[]>(
    initial?.photos?.length ? initial.photos : initial?.photo ? [initial.photo] : []
  );
  const [audio, setAudio] = useState<string | undefined>(initial?.audio);
  const [compressing, setCompressing] = useState(false);
  const [showHarakat, setShowHarakat] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  // Auto-save a draft of a NEW entry so writing is never lost if you leave
  // mid-way. Restored on reopen; cleared once the entry is actually saved.
  // (Photos are excluded — too heavy for localStorage.)
  useEffect(() => {
    if (initial) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.title) setTitle(d.title);
      if (d.content) setContent(d.content);
      if (d.date) setDate(d.date);
      if (d.question) setQuestion(d.question);
      if (typeof d.answering === "boolean") setAnswering(d.answering);
    } catch {
      /* ignore corrupt draft */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (initial) return;
    try {
      if (title.trim() || content.trim()) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ date, title, content, question, answering }));
      } else {
        localStorage.removeItem(DRAFT_KEY);
      }
    } catch {
      /* storage full/unavailable — ignore */
    }
  }, [initial, date, title, content, question, answering]);

  // Insert an Arabic diacritic at the caret (it attaches to the letter before
  // it), then keep focus and caret in place.
  function insertMark(mark: string) {
    const ta = contentRef.current;
    const start = ta ? ta.selectionStart : content.length;
    const end = ta ? ta.selectionEnd : content.length;
    const next = content.slice(0, start) + mark + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(start + mark.length, start + mark.length);
    });
  }

  // Strip all harakat, tanwin, shadda, sukun, tatweel and dagger alif.
  function stripTashkeel() {
    setContent(content.replace(/[ً-ْٰـ]/g, ""));
  }

  const HARAKAT: { m: string; t: string }[] = [
    { m: "َ", t: "فتحة" },
    { m: "ِ", t: "كسرة" },
    { m: "ُ", t: "ضمة" },
    { m: "ّ", t: "شدّة" },
    { m: "ْ", t: "سكون" },
    { m: "ً", t: "تنوين فتح" },
    { m: "ٍ", t: "تنوين كسر" },
    { m: "ٌ", t: "تنوين ضم" },
    { m: "ـ", t: "تطويل" },
  ];

  const titleIdeas = useMemo(
    () => suggestTitles(content, date, answering ? question : undefined),
    [content, date, question, answering]
  );

  const MAX_PHOTOS = 6;

  async function handlePhotoFiles(files: File[]) {
    setCompressing(true);
    try {
      const compressed: string[] = [];
      for (const file of files.slice(0, MAX_PHOTOS - photos.length)) {
        // Lighter target (~140KB) so photos sync to the cloud quickly and
        // stay well under the per-photo document limit.
        compressed.push(await compressImage(file, 140));
      }
      setPhotos((prev) => [...prev, ...compressed].slice(0, MAX_PHOTOS));
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
        photos,
        // photo القديم يبقى مرآة لأول صورة للتوافق مع العروض القديمة
        photo: photos[0] ?? "",
        // قيمة فارغة تمسح الملاحظة الصوتية فعلاً عند إزالتها
        audio: audio ?? "",
      });
    } else {
      addJournalEntry({
        id: uid(),
        date,
        title: title.trim(),
        content: content.trim(),
        ...(answering ? { question } : {}),
        ...(photos.length ? { photos, photo: photos[0] } : {}),
        ...(audio ? { audio } : {}),
        time: nowHHMM(),
        source: "manual",
      });
    }
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
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
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-gray-500">
            ماذا في بالك اليوم؟
            {!initial && (title.trim() || content.trim()) ? (
              <span className="text-finance/80 font-normal"> · يُحفظ تلقائياً ✎</span>
            ) : (
              <span className="text-gray-300 font-normal"> — اكتب /الوقت لإدراج الساعة</span>
            )}
          </label>
          <button
            type="button"
            onClick={() => setShowHarakat((v) => !v)}
            className={
              "text-[11px] font-bold rounded-lg px-2 py-1 press shrink-0 " +
              (showHarakat ? "bg-journal text-white" : "bg-journal/10 text-journal")
            }
          >
            تشكيل
          </button>
        </div>

        {showHarakat && (
          <div className="flex flex-wrap gap-1 mb-2 p-2 bg-journal/5 rounded-xl animate-fade-up">
            {HARAKAT.map((h) => (
              <button
                key={h.t}
                type="button"
                title={h.t}
                onClick={() => insertMark(h.m)}
                className="min-w-8 h-8 px-2 rounded-lg bg-white border border-gray-200 text-base font-bold text-gray-700 hover:border-journal/40 press"
              >
                {"ـ" + h.m}
              </button>
            ))}
            <button
              type="button"
              onClick={stripTashkeel}
              className="h-8 px-2.5 rounded-lg bg-white border border-gray-200 text-[11px] font-semibold text-gray-500 hover:text-red-400 press"
            >
              مسح التشكيل
            </button>
          </div>
        )}

        <textarea
          ref={contentRef}
          value={content}
          onChange={(e) => setContent(expandTimeCommand(e.target.value))}
          rows={8}
          placeholder="اكتب مذكرتك هنا..."
          className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-journal/40 resize-none"
          dir="auto"
        />
      </div>

      {/* الصور: من الكاميرا أو الاستديو، حتى 6 صور — تُضغط تلقائياً */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-2">
          صور اليوم
          {photos.length > 0 && <span className="text-gray-300 font-normal"> — {photos.length}/{MAX_PHOTOS}</span>}
        </label>

        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-2">
            {photos.map((p, i) => (
              <div key={i} className="relative">
                <img src={p} alt={`صورة ${i + 1}`} className="w-full h-24 object-cover rounded-xl" />
                <button
                  onClick={() => setPhotos(photos.filter((_, j) => j !== i))}
                  className="absolute top-1 left-1 bg-black/50 text-white p-1 rounded-full hover:bg-red-500/80 transition-colors"
                  aria-label="حذف الصورة"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {compressing ? (
          <div className="flex items-center justify-center h-20 border-2 border-dashed border-gray-200 rounded-xl">
            <Loader2 size={22} className="text-gray-400 animate-spin" />
          </div>
        ) : photos.length < MAX_PHOTOS ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col items-center justify-center h-20 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-journal/40 transition-colors press">
              <Camera size={20} className="text-gray-400 mb-1" />
              <span className="text-xs text-gray-400">التقط صورة</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => { if (e.target.files?.length) handlePhotoFiles([...e.target.files]); e.target.value = ""; }}
              />
            </label>
            <label className="flex flex-col items-center justify-center h-20 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-journal/40 transition-colors press">
              <ImageIcon size={20} className="text-gray-400 mb-1" />
              <span className="text-xs text-gray-400">من الاستديو</span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => { if (e.target.files?.length) handlePhotoFiles([...e.target.files]); e.target.value = ""; }}
              />
            </label>
          </div>
        ) : (
          <p className="text-[10px] text-gray-300 text-center">وصلت الحد الأقصى ({MAX_PHOTOS} صور)</p>
        )}
        {!compressing && photos.length < MAX_PHOTOS && (
          <p className="text-[10px] text-gray-300 mt-1 text-center">أي صورة تُضغط تلقائياً لتوفير المساحة</p>
        )}
      </div>

      {/* ملاحظة صوتية */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-2">ملاحظة صوتية</label>
        <AudioRecorder value={audio} onChange={setAudio} />
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
