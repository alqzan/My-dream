"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAppStore } from "@/lib/store";
import type { JournalAttachment, JournalEntry, JournalPhotoEdit } from "@/lib/types";
import { MOODS } from "@/lib/types";
import { uid, today, parseDate, entryAudios } from "@/lib/utils";
import { compressImageSmart } from "@/lib/imageUtils";
import { photoHash } from "@/lib/mediaHash";
import { dailyQuestion } from "@/lib/questions";
import { AudioRecorder, MAX_AUDIO_NOTES } from "./AudioRecorder";
import { JournalPhotoEditor } from "./JournalPhotoEditor";
import { entryPhotoSources } from "@/lib/mediaSources";
import { photoEditKey, isDefaultPhotoEdit } from "@/lib/photoEdits";
import { useMediaCacheVersion, resolveMediaSlots } from "@/components/ui/useMedia";
import { Button } from "@/components/ui/Button";
import { Camera, Image as ImageIcon, X, Loader2, Sparkles, Bold, Italic, Heading, List, Quote, Tag, ChevronRight, Paperclip, ChevronDown, FileText, Pencil, Upload } from "lucide-react";
import { AppImage } from "@/components/ui/AppImage";

interface JournalFormProps {
  onClose: () => void;
  initial?: JournalEntry;
  // يومٌ يُفتح المحرّر عليه لمذكرةٍ **جديدة** (يومٌ صامتٌ في السماء مثلاً).
  // لا يمسّ التعديل: `initial.date` أولى دائماً.
  initialDate?: string;
  // يُفتح المحرّر **مجيباً عن سؤال اليوم**. بدونه كان زرّ «اكتب عنه» في بطاقة
  // السؤال يفتح محرّراً عادياً، فيُكتب الجوابُ ولا يُسجَّل أنّه جواب — فتبقى
  // البطاقة تقول «لم تُجب عنه بعد» بعد أن أجبت.
  startAnswering?: boolean;
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
  suggestions.push(`صفحة من دفتر ${d.toLocaleDateString("ar-SA-u-ca-gregory-nu-arab", { month: "long" })}`);

  return [...new Set(suggestions)].slice(0, 4);
}

const DRAFT_KEY = "madar-journal-draft";

export function JournalForm({ onClose, initial, initialDate, startAnswering }: JournalFormProps) {
  const { addJournalEntry, updateJournalEntry, deleteJournalEntry } = useAppStore();
  const [date, setDate] = useState(initial?.date ?? initialDate ?? today());
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [question, setQuestion] = useState(initial?.question ?? dailyQuestion(today()));
  const [answering, setAnswering] = useState(!!initial?.question || !!startAnswering);
  const [photos, setPhotos] = useState<string[]>(
    initial?.photos?.length ? initial.photos : initial?.photo ? [initial.photo] : []
  );
  const [photoEdits, setPhotoEdits] = useState<Record<string, JournalPhotoEdit>>(initial?.photoEdits ?? {});
  const [editingPhoto, setEditingPhoto] = useState<number | null>(null);
  const [audios, setAudios] = useState<string[]>(initial ? entryAudios(initial) : []);
  const [attachments, setAttachments] = useState<JournalAttachment[]>(initial?.attachmentRefs ?? []);
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [mood, setMood] = useState<JournalEntry["mood"]>(initial?.mood);
  const [compressing, setCompressing] = useState(false);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [attachmentError, setAttachmentError] = useState("");
  const [audioBusy, setAudioBusy] = useState(false);
  const [audioError, setAudioError] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(initial ? "saved" : "idle");
  // المرفقات جزءٌ مرئي من ورقة الكتابة في التصميم الجديد. تبقى حالة الطيّ
  // اختيارية لمن يريد مساحةً أنظف، لكن لا تُخفى تلقائياً كي لا يضيع وجود PDF.
  const [showExtras, setShowExtras] = useState(true);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Always points at the latest handleDone so the mount-time keydown/effect
  // below can call it without capturing a stale closure over the form state.
  const handleDoneRef = useRef<() => void>(() => {});

  // المراجع الهاشية القديمة تبقى جزءاً من المعاينة والتحرير حتى لو لم تُرطَّب
  // بعد؛ الصور المحلية المضافة في هذه الجلسة تلحق بها ولا تستبدلها.
  useMediaCacheVersion();
  const photoSources = useMemo(() => {
    const draft = initial
      ? { ...initial, photos, photo: photos[0] ?? "" }
      : ({ id: "draft", date, content: "", photos, photo: photos[0] ?? "" } as JournalEntry);
    return entryPhotoSources(draft);
  }, [initial, photos, date]);
  const photoSlots = resolveMediaSlots(photoSources);

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

  const hasSomething = () => Boolean(content.trim() || title.trim() || photos.length || audios.length || attachments.length || tags.length);

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

  function shiftDate(days: number) {
    const d = parseDate(date);
    d.setDate(d.getDate() + days);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    setDate(iso);
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
        audios,
        audio: audios[0] ?? "",
        attachmentRefs: attachments,
        photoEdits,
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
        ...(audios.length ? { audios, audio: audios[0] } : {}),
        ...(attachments.length ? { attachmentRefs: attachments } : {}),
        ...(Object.keys(photoEdits).length ? { photoEdits } : {}),
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
  }, [date, title, content, question, answering, photos, audios, attachments, photoEdits, tags, mood]);

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
        audios: entryAudios(initial),
        audio: initial.audio ?? "",
        attachmentRefs: initial.attachmentRefs ?? [],
        photoEdits: initial.photoEdits ?? {},
        tags: initial.tags ?? [],
        mood: initial.mood,
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
    () => suggestTitles(content, date),
    [content, date]
  );

  const MAX_PHOTOS = 12;
  const MAX_ATTACHMENTS = 10;
  const MAX_ATTACHMENT_BYTES = 32 * 1024 * 1024;
  const MAX_AUDIO_FILE_BYTES = 32 * 1024 * 1024;

  async function handlePhotoFiles(files: File[]) {
    setCompressing(true);
    try {
      const compressed: string[] = [];
      for (const file of files.slice(0, MAX_PHOTOS - photos.length)) {
        // Lighter target (~140KB) so photos sync to the cloud quickly and
        // stay well under the per-photo document limit.
        compressed.push(await compressImageSmart(file, 140));
      }
      setPhotos((prev) => [...prev, ...compressed].slice(0, MAX_PHOTOS));
    } finally {
      setCompressing(false);
    }
  }

  function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error("تعذّر قراءة الملف"));
      reader.readAsDataURL(file);
    });
  }

  async function handleAttachmentFiles(files: File[]) {
    setAttachmentError("");
    const remaining = MAX_ATTACHMENTS - attachments.length;
    if (remaining <= 0) return;
    setAttachmentBusy(true);
    try {
      const next: JournalAttachment[] = [];
      for (const file of files.slice(0, remaining)) {
        const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        if (file.size > MAX_ATTACHMENT_BYTES) {
          setAttachmentError("حجم الملف الواحد يجب ألا يتجاوز 32 م.ب.");
          continue;
        }
        const localData = await fileToDataUrl(file);
        const hash = await photoHash(localData);
        if (attachments.some((a) => a.hash === hash) || next.some((a) => a.hash === hash)) continue;
        next.push({
          kind: isPdf ? "pdf" : "file",
          filename: file.name,
          hash,
          contentType: file.type || (isPdf ? "application/pdf" : "application/octet-stream"),
          size: file.size,
          status: "uploaded",
          localData,
        });
      }
      if (next.length) setAttachments((prev) => [...prev, ...next].slice(0, MAX_ATTACHMENTS));
    } catch {
      setAttachmentError("تعذّرت قراءة الملف — جرّب اختياره مرة أخرى.");
    } finally {
      setAttachmentBusy(false);
    }
  }

  async function handleAudioFiles(files: File[]) {
    setAudioError("");
    const remaining = MAX_AUDIO_NOTES - audios.length;
    if (remaining <= 0) return;
    setAudioBusy(true);
    try {
      const next: string[] = [];
      for (const file of files.slice(0, remaining)) {
        if (!file.type.startsWith("audio/") && !/\.(aac|flac|m4a|mp3|oga|ogg|wav|webm)$/i.test(file.name)) {
          setAudioError("اختر ملفات صوتية فقط.");
          continue;
        }
        if (file.size > MAX_AUDIO_FILE_BYTES) {
          setAudioError("حجم الملف الصوتي الواحد يجب ألا يتجاوز 32 م.ب.");
          continue;
        }
        const data = await fileToDataUrl(file);
        const duplicate = [...audios, ...next].some((audio) => audio === data);
        if (!duplicate) next.push(data);
      }
      if (next.length) setAudios((prev) => [...prev, ...next].slice(0, MAX_AUDIO_NOTES));
    } catch {
      setAudioError("تعذّرت قراءة الملف الصوتي — جرّب اختياره مرة أخرى.");
    } finally {
      setAudioBusy(false);
    }
  }

  function savePhotoEdit(index: number, edit: JournalPhotoEdit) {
    const source = photoSources[index];
    if (!source) return;
    const key = photoEditKey(source);
    setPhotoEdits((prev) => {
      const next = { ...prev };
      if (isDefaultPhotoEdit(edit)) delete next[key];
      else next[key] = edit;
      return next;
    });
  }

  const editingIndex = editingPhoto;
  const editingSource = editingIndex === null ? undefined : photoSources[editingIndex];
  const editingUrl = editingIndex === null ? undefined : photoSlots[editingIndex] ?? undefined;

  if (typeof document === "undefined") return null;

  return createPortal(
    // محرّر بملء الشاشة (لا نافذة) — أكثر انغماساً للكتابة.
    //
    // طبقتان عمداً:
    //   • الخارجية `inset-0` بخلفيةٍ معتمة تغطّي **الشاشة كاملةً** (منفذ التخطيط)،
    //     فلا تظهر الصفحةُ التي خلفه أبداً.
    //   • الداخلية تتبع **المنفذ المرئي** (‎--vvh/--vvo‎) فيبقى الحقلُ النشط
    //     والأزرار فوق لوحة المفاتيح.
    // كانت الطبقتان واحدةً فتقلّص المحرّر إلى المنفذ المرئي وانكشف تحته شريطٌ من
    // صفحة المذكرات (بطاقة «في مثل هذا اليوم» وزرّ الإضافة) — يظهر كلما تركت
    // لوحةُ المفاتيح أثراً في القياس: شريط لوحة الآيباد المصغّرة، أو قياسٌ لم
    // يُحدَّث بعدُ على الجوال.
    <div className="fixed inset-0 z-50 mdr mdr-journal-composer [animation:fadeIn_0.2s_ease_both]">
      <div
        className="absolute inset-x-0 flex flex-col bg-[var(--paper)]"
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
        <Button onClick={handleDone} size="sm" className="mdr-journal-done">تم</Button>
      </header>

      {/* المحتوى — يمرّر داخل الشاشة */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain">
        <div className="max-w-2xl mx-auto w-full space-y-4 px-4 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="mdr-journal-context" aria-label="سياق المذكرة">
        <div>
          <span>تتحدث عن</span>
          <strong>{date}</strong>
        </div>
        <div className="mdr-journal-context-meta">
          <span>{answering ? "إجابة سؤال اليوم" : initial?.time ? `كُتبت ${initial.time}` : "مذكرة اليوم"}</span>
          <span>{saveState === "saving" ? "يُحفظ…" : saveState === "saved" ? "محفوظ تلقائياً" : "مسودة"}</span>
        </div>
      </div>

      {/* العنوان — كبير وغامق في الأعلى */}
      <div>
        <input
          value={title}
          onChange={(e) => setTitle(expandTimeCommand(e.target.value))}
          placeholder="عنوان المذكرة"
          aria-label="عنوان المذكرة"
          dir="auto"
          className="w-full text-xl font-black border-0 border-b-2 border-[var(--line)] focus:border-[var(--gold)] bg-transparent px-1 py-2 focus:outline-none placeholder:text-gray-300 placeholder:font-bold"
        />
        {!title && titleIdeas.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mt-2">
            <Sparkles size={13} className="text-[var(--gold)] mt-1" />
            {titleIdeas.map((t) => (
              <button
                key={t}
                onClick={() => setTitle(t)}
                className="text-[11px] bg-[var(--goldw)] text-[var(--gold)] px-2.5 py-1 rounded-full hover:bg-[var(--goldw)] transition-colors press"
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mdr-journal-date-row">
        <label className="block text-xs font-medium text-gray-500 mb-1">تاريخ المذكرة</label>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="flex-1 border border-[var(--line)] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gline)]"
          />
          <div className="mdr-journal-date-actions">
            <button type="button" onClick={() => setDate(today())} className="is-active">اليوم</button>
            <button type="button" onClick={() => shiftDate(-1)}>أمس</button>
            <button type="button" onClick={() => shiftDate(1)}>غدًا</button>
          </div>
        </div>
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
        <div className="mdr-journal-editor rounded-2xl border border-[var(--line)] bg-[var(--paper2)] overflow-hidden transition-colors focus-within:border-[var(--gline)] focus-within:ring-2 focus-within:ring-[var(--goldw)]">
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
                className="w-8 h-8 rounded-lg text-gray-500 hover:bg-[var(--goldw)] hover:text-[var(--gold)] press flex items-center justify-center"
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
            className="w-full min-h-[260px] block bg-transparent px-4 py-3.5 text-[15px] leading-loose focus:outline-none resize-none mdr-journal-lined-paper"
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

      {/* إضافات — صور وPDF وصوت ووسوم، تبقى محفوظةً في نفس حقول المذكرة */}
      <div>
        <button
          type="button"
          onClick={() => setShowExtras((v) => !v)}
          className="w-full flex items-center gap-2 text-xs font-bold text-gray-500 py-2 press mdr-journal-attachments-toggle"
        >
          <Paperclip size={14} className="text-[var(--gold)]" />
          المرفقات
          {(() => {
            const n = photos.length + audios.length + attachments.length + tags.length + (mood ? 1 : 0);
            return n > 0 ? <span className="text-[10px] bg-[var(--goldw)] text-[var(--gold)] rounded-full px-2 py-0.5">{n}</span> : null;
          })()}
          <span className="text-gray-300 font-normal">صور · صوت · PDF · وسوم · شعور</span>
          <ChevronDown size={15} className={`ms-auto transition-transform ${showExtras ? "rotate-180" : ""}`} />
        </button>
        {showExtras && (
          <div className="space-y-4 mt-2 mdr-journal-attachments">
      {/* الصور: من الكاميرا أو الاستديو، حتى 12 صورة — تُضغط تلقائياً. تعرض
          أيضاً مراجع Day One/السحابة الموجودة كي لا تبدو كأنها اختفت عند
          تعديل مذكرة قديمة. */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-2">
          صور اليوم
          {photoSources.length > 0 && <span className="text-gray-300 font-normal"> — {photoSources.length}/{MAX_PHOTOS}</span>}
        </label>

        {photoSources.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-2">
            {photoSources.map((source, i) => {
              const p = photoSlots[i];
              const localIndex = source.inline === undefined ? -1 : photos.findIndex((item) => item === source.inline);
              const key = photoEditKey(source);
              return (
              <div key={`${key}-${i}`} className="mdr-journal-photo-tile relative">
                {p ? (
                  <AppImage
                    src={p}
                    alt={`صورة ${i + 1}`}
                    className="w-full h-24 object-cover rounded-xl transition-transform duration-150"
                    style={{ transform: `translate(${photoEdits[key]?.offsetX ?? 0}%, ${photoEdits[key]?.offsetY ?? 0}%) rotate(${photoEdits[key]?.rotation ?? 0}deg) scale(${(photoEdits[key]?.flipX ? -1 : 1) * (photoEdits[key]?.scale ?? 1)}, ${(photoEdits[key]?.flipY ? -1 : 1) * (photoEdits[key]?.scale ?? 1)})` }}
                  />
                ) : (
                  <div className="flex h-24 items-center justify-center rounded-xl bg-[var(--paper2)] text-[10px] text-[var(--ink52)]">جارٍ جلب الصورة…</div>
                )}
                {p && (
                  <button
                    type="button"
                    onClick={() => setEditingPhoto(i)}
                    className="absolute bottom-1 right-1 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[10px] font-bold text-white press"
                    aria-label={`تحرير الصورة ${i + 1}`}
                  >
                    <Pencil size={11} /> تحرير
                  </button>
                )}
                {localIndex >= 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setPhotos((prev) => prev.filter((_, j) => j !== localIndex));
                    setPhotoEdits((prev) => { const next = { ...prev }; delete next[key]; return next; });
                  }}
                  className="absolute top-1 left-1 bg-black/50 text-white p-1 rounded-full hover:bg-red-500/80 transition-colors"
                  aria-label="حذف الصورة"
                >
                  <X size={12} />
                </button>
                )}
              </div>
              );
            })}
          </div>
        )}

        {compressing ? (
          <div className="flex items-center justify-center h-20 border-2 border-dashed border-gray-200 rounded-xl">
            <Loader2 size={22} className="text-gray-400 animate-spin" />
          </div>
        ) : photoSources.length < MAX_PHOTOS ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col items-center justify-center h-20 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-[var(--gline)] transition-colors press">
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
            <label className="flex flex-col items-center justify-center h-20 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-[var(--gline)] transition-colors press">
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
        {!compressing && photoSources.length < MAX_PHOTOS && (
          <p className="text-[10px] text-gray-300 mt-1 text-center">أي صورة تُضغط تلقائياً لتوفير المساحة</p>
        )}
      </div>

      {/* ملفات متعددة — تحفظ المذكرة المرجع والبيانات المحلية، وترفعها
          المزامنة إلى مخزن الوسائط دون حشر الملف داخل مستند Firestore. */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-2">
          ملفات ومرفقات
          {attachments.length > 0 && <span className="text-gray-300 font-normal"> — {attachments.length}/{MAX_ATTACHMENTS}</span>}
        </label>
        {attachments.length > 0 && (
          <div className="space-y-1.5 mb-2">
            {attachments.map((attachment, index) => (
              <div key={attachment.sourceMediaID ?? attachment.hash ?? `${attachment.filename}-${index}`} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-2.5 py-2">
                <FileText size={17} className={attachment.kind === "pdf" ? "text-red-500 shrink-0" : "text-[var(--gold)] shrink-0"} />
                  <span className="text-xs text-gray-700 truncate flex-1" title={attachment.filename}>{attachment.filename || `ملف ${index + 1}`}</span>
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== index))}
                  className="p-1 text-gray-300 hover:text-red-500 rounded-lg press"
                  aria-label={`حذف ${attachment.filename || "ملف PDF"}`}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
        {attachmentBusy ? (
          <div className="flex items-center justify-center h-16 border-2 border-dashed border-gray-200 rounded-xl">
            <Loader2 size={20} className="text-gray-400 animate-spin" />
          </div>
        ) : attachments.length < MAX_ATTACHMENTS ? (
          <label className="flex items-center justify-center gap-2 h-16 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-[var(--gline)] transition-colors press">
            <FileText size={19} className="text-gray-400" />
            <span className="text-xs text-gray-400">أضف ملفات متعددة</span>
            <input
              type="file"
              accept="*/*"
              multiple
              className="hidden"
              onChange={(e) => { if (e.target.files?.length) void handleAttachmentFiles([...e.target.files]); e.target.value = ""; }}
            />
          </label>
        ) : (
          <p className="text-[10px] text-gray-300 text-center">وصلت الحد الأقصى ({MAX_ATTACHMENTS} ملفات)</p>
        )}
        {attachmentError && <p className="text-[11px] text-red-500 mt-1.5">{attachmentError}</p>}
        <p className="text-[10px] text-gray-300 mt-1 text-center">أي ملف حتى 32 م.ب. · الصور والصوتيات لها مساراتها السريعة أيضاً</p>
      </div>

      {/* ملاحظة صوتية */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-2">
          ملاحظات صوتية
          {audios.length > 0 && (
            <span className="text-gray-300 font-normal"> — {audios.length}/{MAX_AUDIO_NOTES}</span>
          )}
        </label>
        <AudioRecorder values={audios} onChange={setAudios} />
        {audioBusy ? (
          <div className="mt-2 flex items-center justify-center gap-2 h-12 border-2 border-dashed border-gray-200 rounded-xl text-xs text-gray-400">
            <Loader2 size={17} className="animate-spin" /> جارٍ إضافة الصوت…
          </div>
        ) : audios.length < MAX_AUDIO_NOTES ? (
          <label className="mt-2 flex items-center justify-center gap-2 h-12 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-[var(--gline)] transition-colors press">
            <Upload size={17} className="text-gray-400" />
            <span className="text-xs text-gray-400">أضف ملفات صوتية متعددة</span>
            <input
              type="file"
              accept="audio/*,.aac,.flac,.m4a,.mp3,.oga,.ogg,.wav,.webm"
              multiple
              className="hidden"
              onChange={(e) => { if (e.target.files?.length) void handleAudioFiles([...e.target.files]); e.target.value = ""; }}
            />
          </label>
        ) : null}
        {audioError && <p className="text-[11px] text-red-500 mt-1.5">{audioError}</p>}
        <p className="text-[10px] text-gray-300 mt-1 text-center">تسجيل أو رفع حتى {MAX_AUDIO_NOTES} مقاطع صوتية · الأصل يبقى محفوظاً</p>
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
                className="flex items-center gap-1 text-[11px] font-medium bg-[var(--goldw)] text-[var(--gold)] px-2.5 py-1 rounded-full"
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
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gline)]"
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
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl border press transition-colors ${mood === m.value ? "border-[var(--gold)] bg-[var(--goldw)]" : "border-gray-200 dark:border-transparent bg-white dark:bg-[#241c12]"}`}
              >
                <span className={`mdr-mood-diamond ${mood === m.value ? "is-active" : ""}`} aria-hidden="true" />
                <span className={`text-[9px] ${mood === m.value ? "text-[var(--gold)] font-bold" : "text-gray-400"}`}>{m.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
          </div>
        )}
      </div>

      {editingIndex !== null && editingSource && editingUrl && (
        <JournalPhotoEditor
          src={editingUrl}
          initial={photoEdits[photoEditKey(editingSource)]}
          label={`صورة ${editingIndex + 1}`}
          onSave={(edit) => savePhotoEdit(editingIndex, edit)}
          onClose={() => setEditingPhoto(null)}
        />
      )}

      {/* تجاهل — الرجوع/«تم» يحفظان تلقائياً؛ هذا الخيار الوحيد المُتلِف */}
      <div className="pt-1">
        <button
          onClick={handleCancel}
          className="w-full py-2 text-center text-xs font-medium text-red-400 hover:text-red-500 press"
        >
          {initial ? "إلغاء التعديلات" : "تجاهل هذه المذكرة"}
        </button>
      </div>

        </div>
      </div>
      </div>
    </div>,
    document.body
  );
}
