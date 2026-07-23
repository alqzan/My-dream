"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAppStore } from "@/lib/store";
import type { JournalEntry } from "@/lib/types";
import { MOODS } from "@/lib/types";
import { uid, today, parseDate } from "@/lib/utils";
import { compressImage } from "@/lib/imageUtils";
import { dailyQuestion, randomQuestion, QUESTION_LIBRARY } from "@/lib/questions";
import { AudioRecorder } from "./AudioRecorder";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Camera, Image as ImageIcon, X, Loader2, RefreshCw, Library, Sparkles, Bold, Italic, Heading, List, Quote, Tag, ChevronRight, Paperclip, ChevronDown } from "lucide-react";

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
  const { addJournalEntry, updateJournalEntry, deleteJournalEntry } = useAppStore();
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
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [mood, setMood] = useState<JournalEntry["mood"]>(initial?.mood);
  const [compressing, setCompressing] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(initial ? "saved" : "idle");
  // «إضافات» — صور/صوت/وسوم/شعور مطويّة لإبقاء سطح الكتابة صافياً، وتُفتح تلقائياً
  // عند تعديل مذكرةٍ فيها إضافات أصلاً.
  const [showExtras, setShowExtras] = useState(
    Boolean(initial?.photos?.length || initial?.photo || initial?.audio || initial?.tags?.length || initial?.mood)
  );
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Always points at the latest handleDone so the mount-time keydown/effect
  // below can call it without capturing a stale closure over the form state.
  const handleDoneRef = useRef<() => void>(() => {});

  // Auto-grow the writing area to fit its content so there's no cramped inner
  // scrollbar — you just keep writing and the sheet scrolls. Runs on every
  // content change (typing, formatting buttons, restored draft).
  useEffect(() => {
    const ta = contentRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
  }, [content]);

  // Full-screen composer lifecycle: lock the page behind it, restore focus on
  // close, land straight in the writing area for a fresh entry, and treat
  // Escape as "save & close" (never a destructive discard — everything here
  // auto-saves, so backing out should keep, not delete).
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const prevFocused = document.activeElement as HTMLElement | null;
    if (!initial) requestAnimationFrame(() => contentRef.current?.focus());
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); handleDoneRef.current(); }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      prevFocused?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When a field gains focus, glide it to the centre of the writing area once
  // the keyboard has settled, so you never type behind the on-screen keyboard.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const typing = t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable;
      if (!typing) return;
      window.setTimeout(() => t.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
    };
    scroller.addEventListener("focusin", onFocusIn);
    return () => scroller.removeEventListener("focusin", onFocusIn);
  }, []);

  // Auto-save plumbing. Once an entry exists (editing, or a new one we have
  // already auto-created), savedId points at the row we keep updating.
  const savedId = useRef<string | undefined>(initial?.id);
  const firstRun = useRef(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

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
    if (initial || savedId.current) return;
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

  const hasSomething = () => Boolean(content.trim() || title.trim() || photos.length || audio || tags.length);

  // إضافة وسم: تشذيب، بلا تكرار، وحد أقصى معقول للعدد والطول.
  function addTag(raw: string) {
    const t = raw.trim().replace(/^#/, "").slice(0, 24);
    if (!t) return;
    setTags((prev) => (prev.includes(t) || prev.length >= 12 ? prev : [...prev, t]));
    setTagInput("");
  }
  function removeTag(t: string) {
    setTags((prev) => prev.filter((x) => x !== t));
  }

  // Persist the current state — create the entry on first save, update it
  // afterwards. This is what makes writing auto-save with no "save" tap.
  function persist() {
    if (!hasSomething()) return;
    if (savedId.current) {
      updateJournalEntry(savedId.current, {
        date,
        title: title.trim(),
        content: content.trim(),
        question: answering ? question : "",
        photos,
        photo: photos[0] ?? "",
        audio: audio ?? "",
        tags,
        mood,
      });
    } else {
      const id = uid();
      addJournalEntry({
        id,
        date,
        title: title.trim(),
        content: content.trim(),
        ...(answering ? { question } : {}),
        ...(photos.length ? { photos, photo: photos[0] } : {}),
        ...(audio ? { audio } : {}),
        ...(tags.length ? { tags } : {}),
        ...(mood ? { mood } : {}),
        time: nowHHMM(),
        source: "manual",
      });
      savedId.current = id;
    }
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    setSaveState("saved");
  }

  // Debounced auto-save: fires ~700ms after the last edit to any field.
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    if (!hasSomething()) return;
    setSaveState("saving");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(persist, 700);
    return () => clearTimeout(saveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, title, content, question, answering, photos, audio, tags, mood]);

  // "تم" — flush any pending save immediately and close. If the entry was
  // emptied out, treat it as a cancel: delete the auto-created row (or revert
  // an edited one) instead of leaving a blank/stale entry behind.
  function handleDone() {
    clearTimeout(saveTimer.current);
    if (!hasSomething()) {
      handleCancel();
      return;
    }
    persist();
    onClose();
  }
  handleDoneRef.current = handleDone;

  // "إلغاء" — undo this session: revert an edited entry to its original, or
  // remove a new one we auto-created, so cancel still means cancel.
  function handleCancel() {
    clearTimeout(saveTimer.current);
    if (initial) {
      updateJournalEntry(initial.id, {
        date: initial.date,
        title: initial.title ?? "",
        content: initial.content,
        question: initial.question ?? "",
        photos: initial.photos ?? (initial.photo ? [initial.photo] : []),
        photo: initial.photo ?? "",
        audio: initial.audio ?? "",
        tags: initial.tags ?? [],
      });
    } else if (savedId.current) {
      deleteJournalEntry(savedId.current);
    }
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    onClose();
  }

  // Markdown helpers for the formatting toolbar — wrap the selection
  // (bold/italic) or prefix the current line (heading/list/quote).
  function wrapSelection(before: string, after = before) {
    const ta = contentRef.current;
    if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const sel = content.slice(s, e) || "نص";
    setContent(content.slice(0, s) + before + sel + after + content.slice(e));
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(s + before.length, s + before.length + sel.length);
    });
  }
  function prefixLine(token: string) {
    const ta = contentRef.current;
    if (!ta) return;
    const s = ta.selectionStart;
    const lineStart = content.lastIndexOf("\n", s - 1) + 1;
    setContent(content.slice(0, lineStart) + token + content.slice(lineStart));
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(s + token.length, s + token.length);
    });
  }

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

  if (typeof document === "undefined") return null;

  return createPortal(
    // محرّر بملء الشاشة (لا نافذة) — أكثر انغماساً للكتابة. عمود ثابت أعلى
    // (رجوع/حفظ + «تم») ثم مساحة تمرّر داخلياً. يتبع المنفذ المرئي (‎--vvh/--vvo‎)
    // حتى لا تخفي لوحة المفاتيح الحقلَ النشط أو الأزرار.
    <div
      className="fixed inset-0 z-50 flex flex-col bg-white [animation:fadeIn_0.2s_ease_both]"
      style={{ top: "var(--vvo, 0px)", height: "var(--vvh, 100dvh)" }}
    >
      {/* شريط علوي ثابت */}
      <header className="shrink-0 flex items-center justify-between gap-2 px-2 border-b border-gray-100 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <button
          onClick={handleDone}
          aria-label="حفظ وإغلاق"
          className="p-2 rounded-full text-gray-500 hover:bg-gray-100 press"
        >
          <ChevronRight size={24} />
        </button>
        <div className="flex-1 min-w-0 text-center">
          <p className="text-sm font-bold text-gray-900 truncate">{initial ? "تعديل المذكرة" : "مذكرة جديدة"}</p>
          <span className="block h-3 leading-3 text-[11px] text-gray-400">
            {saveState === "saving" ? "يُحفظ…" : saveState === "saved" ? "محفوظ تلقائياً ✓" : ""}
          </span>
        </div>
        <Button onClick={handleDone} size="sm" className="bg-journal hover:bg-journal/90">تم</Button>
      </header>

      {/* المحتوى — يمرّر داخل الشاشة */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain">
        <div className="max-w-2xl mx-auto w-full space-y-4 px-4 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
      {/* العنوان — كبير وغامق في الأعلى */}
      <div>
        <input
          value={title}
          onChange={(e) => setTitle(expandTimeCommand(e.target.value))}
          placeholder="عنوان اليوم ✨"
          aria-label="عنوان المذكرة"
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
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium text-gray-500">ماذا في بالك اليوم؟</label>
          <span className="text-[11px] font-normal h-4">
            {saveState === "saving" && <span className="text-gray-400">يُحفظ…</span>}
            {saveState === "saved" && <span className="text-finance/80">حُفظ ✓</span>}
          </span>
        </div>

        {/* محرّر النص: شريط تنسيق ثابت (بلمسة واحدة) + مساحة تتمدّد مع الكتابة */}
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden transition-colors focus-within:border-journal/50 focus-within:ring-2 focus-within:ring-journal/20">
          <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-gray-100 bg-gray-50/70">
            {[
              { icon: Bold, t: "عريض", fn: () => wrapSelection("**") },
              { icon: Italic, t: "مائل", fn: () => wrapSelection("_") },
              { icon: Heading, t: "عنوان", fn: () => prefixLine("## ") },
              { icon: List, t: "قائمة", fn: () => prefixLine("- ") },
              { icon: Quote, t: "اقتباس", fn: () => prefixLine("> ") },
            ].map((b) => (
              <button
                key={b.t}
                type="button"
                title={b.t}
                aria-label={b.t}
                onClick={b.fn}
                className="w-8 h-8 rounded-lg text-gray-500 hover:bg-journal/10 hover:text-journal press flex items-center justify-center"
              >
                <b.icon size={16} />
              </button>
            ))}
            <span className="ms-auto text-[10px] text-gray-300 pe-1.5 select-none">اكتب /الوقت للساعة</span>
          </div>
          <textarea
            ref={contentRef}
            value={content}
            onChange={(e) => setContent(expandTimeCommand(e.target.value))}
            placeholder="اكتب مذكرتك هنا…"
            aria-label="نص المذكرة"
            className="w-full min-h-[220px] block bg-transparent px-4 py-3.5 text-[15px] leading-loose focus:outline-none resize-none"
            dir="auto"
          />
        </div>
        <div className="flex justify-end mt-1 h-3">
          {content.trim() && (
            <span className="text-[10px] text-gray-300">
              {content.trim().split(/\s+/).length} كلمة
            </span>
          )}
        </div>
      </div>

      {/* إضافات — تُطوى لتبقى الكتابة في الصدارة، وتُفتح عند الحاجة */}
      <div>
        <button
          type="button"
          onClick={() => setShowExtras((v) => !v)}
          className="w-full flex items-center gap-2 text-xs font-bold text-gray-500 py-2 press"
        >
          <Paperclip size={14} className="text-journal" />
          إضافات
          {(() => {
            const n = photos.length + (audio ? 1 : 0) + tags.length + (mood ? 1 : 0);
            return n > 0 ? <span className="text-[10px] bg-journal/10 text-journal rounded-full px-2 py-0.5">{n}</span> : null;
          })()}
          <span className="text-gray-300 font-normal">صور · صوت · وسوم · شعور</span>
          <ChevronDown size={15} className={`ms-auto transition-transform ${showExtras ? "rotate-180" : ""}`} />
        </button>
        {showExtras && (
          <div className="space-y-4 mt-2">
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

      {/* وسوم — للتصنيف والفلترة لاحقاً */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
          <Tag size={12} /> وسوم
          {tags.length > 0 && <span className="text-gray-300 font-normal">— {tags.length}</span>}
        </label>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {tags.map((t) => (
              <span
                key={t}
                className="flex items-center gap-1 text-[11px] font-medium bg-journal/10 text-journal px-2.5 py-1 rounded-full"
              >
                #{t}
                <button
                  onClick={() => removeTag(t)}
                  className="hover:text-red-500 press"
                  aria-label={`حذف الوسم ${t}`}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        {tags.length < 12 && (
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTag(tagInput);
              } else if (e.key === "Backspace" && !tagInput && tags.length) {
                removeTag(tags[tags.length - 1]);
              }
            }}
            onBlur={() => addTag(tagInput)}
            placeholder="أضف وسماً واضغط Enter (مثل: سفر، عائلة)"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-journal/40"
          />
        )}
      </div>

      {/* شعور اليوم — اختياريّ تماماً، يظهر بعد الكتابة فلا يزيد الاحتكاك */}
      {(content.trim() || mood) && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-2">شعور اليوم (اختياري)</label>
          <div className="flex items-center gap-1.5">
            {MOODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMood(mood === m.value ? undefined : m.value)}
                aria-label={m.label}
                aria-pressed={mood === m.value}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl border press transition-colors ${mood === m.value ? "border-journal bg-journal/10" : "border-gray-200 dark:border-transparent bg-white dark:bg-[#241c12]"}`}
              >
                <span className="text-xl leading-none">{m.emoji}</span>
                <span className={`text-[9px] ${mood === m.value ? "text-journal font-bold" : "text-gray-400"}`}>{m.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
          </div>
        )}
      </div>

      {/* تجاهل — الرجوع/«تم» يحفظان تلقائياً؛ هذا الخيار الوحيد المُتلِف */}
      <div className="pt-1">
        <button
          onClick={handleCancel}
          className="w-full py-2 text-center text-xs font-medium text-red-400 hover:text-red-500 press"
        >
          {initial ? "إلغاء التعديلات" : "تجاهل هذه المذكرة"}
        </button>
      </div>

      {/* مكتبة الأسئلة */}
      <Modal open={showLibrary} onClose={() => setShowLibrary(false)} title="مكتبة الأسئلة 📚" className="sm:max-w-2xl">
        <QuestionLibrary
          onPick={(q) => { setQuestion(q); setAnswering(true); setShowLibrary(false); }}
        />
      </Modal>
        </div>
      </div>
    </div>,
    document.body
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
