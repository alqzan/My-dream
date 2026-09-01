"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAppStore } from "@/lib/store";
import type { JournalAttachment, JournalEntry, JournalPhotoEdit } from "@/lib/types";
import { MOODS } from "@/lib/types";
import {
  uid,
  today,
  parseDate,
  entryAudios,
  formatDate,
  hijriDate,
  normalizeArabic,
  toIndicDigits,
  arabicCount,
  photosCount,
  audiosCount,
  filesCount,
} from "@/lib/utils";
import { compressImageSmart } from "@/lib/imageUtils";
import { photoHash } from "@/lib/mediaHash";
import { dailyQuestion } from "@/lib/questions";
import { AudioRecorder, MAX_AUDIO_NOTES } from "./AudioRecorder";
import { JournalPhotoEditor } from "./JournalPhotoEditor";
import { entryPhotoSources } from "@/lib/mediaSources";
import { photoEditKey, isDefaultPhotoEdit } from "@/lib/photoEdits";
import { useMediaCacheVersion, resolveMediaSlots } from "@/components/ui/useMedia";
import {
  AudioLines,
  Bold,
  Camera,
  Check,
  ChevronDown,
  FileText,
  Heading,
  Image as ImageIcon,
  Italic,
  List,
  Loader2,
  Paperclip,
  Pencil,
  Quote,
  RemoveFormatting,
  Sparkles,
  Tag,
  Upload,
  X,
} from "lucide-react";
import { AppImage } from "@/components/ui/AppImage";
import { MOOD_SKY } from "@/lib/memoryDome";

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

import { createJournalDraftWriter, type JournalDraftWriter } from "@/lib/journalDraft";

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
  const addJournalEntry = useAppStore((state) => state.addJournalEntry);
  const updateJournalEntry = useAppStore((state) => state.updateJournalEntry);
  const deleteJournalEntry = useAppStore((state) => state.deleteJournalEntry);
  const seedDate = initial?.date ?? initialDate ?? today();
  const [date, setDate] = useState(seedDate);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [draftReady, setDraftReady] = useState(Boolean(initial));
  const [question, setQuestion] = useState(initial?.question ?? dailyQuestion(seedDate));
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
  // المرفقات القديمة تُفتح مرئيةً عند تعديل المذكرة حتى لا يبدو ملف Day One
  // وكأنه اختفى. أمّا الورقة الجديدة فتبدأ هادئة، وتُفتح الأدوات من الرصيف
  // السفلي كما في التصميم المرجعي.
  const [showExtras, setShowExtras] = useState(() => Boolean(
    initial && (
      (initial.photos?.length ?? (initial.photo ? 1 : 0)) > 0 ||
      entryAudios(initial).length > 0 ||
      (initial.attachmentRefs?.length ?? 0) > 0 ||
      (initial.tags?.length ?? 0) > 0
    )
  ));
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const extrasRef = useRef<HTMLDivElement>(null);
  const draftWriterRef = useRef<JournalDraftWriter | null>(null);
  // Always points at the latest handleDone so the mount-time keydown/effect
  // below can call it without capturing a stale closure over the form state.
  const handleDoneRef = useRef<() => void>(() => {});

  // المراجع الهاشية القديمة تبقى جزءاً من المعاينة والتحرير حتى لو لم تُرطَّب
  // بعد؛ الصور المحلية المضافة في هذه الجلسة تلحق بها ولا تستبدلها.
  const mediaCacheVersion = useMediaCacheVersion();
  const photoSources = useMemo(() => {
    const draft = initial
      ? { ...initial, photos, photo: photos[0] ?? "" }
      : ({ id: "draft", date, content: "", photos, photo: photos[0] ?? "" } as JournalEntry);
    return entryPhotoSources(draft);
  }, [initial, photos, date]);
  // Media bytes can arrive asynchronously, so the cache version still needs to
  // invalidate this view. The memo prevents every keystroke from walking all
  // old photo/audio references in an entry with a large attachment history.
  const photoSlots = useMemo(
    () => resolveMediaSlots(photoSources),
    // The cache version is intentionally an invalidation dependency: the
    // sources stay identical while an async media download fills a slot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [photoSources, mediaCacheVersion]
  );

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
  // (Photos are excluded — too heavy for localStorage.) The writer batches the
  // synchronous localStorage operation so it never runs once per keypress.
  useEffect(() => {
    if (initial) return;
    let writer: JournalDraftWriter | null = null;
    try {
      writer = createJournalDraftWriter(window.localStorage, DRAFT_KEY);
      draftWriterRef.current = writer;
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d.title) setTitle(d.title);
        if (d.content) setContent(d.content);
        if (d.date) setDate(d.date);
        if (d.question) setQuestion(d.question);
        if (typeof d.answering === "boolean") setAnswering(d.answering);
      }
    } catch {
      /* ignore corrupt draft */
    }
    // Keep the first empty render from scheduling a removal before a saved
    // draft has had a chance to hydrate into the form (important in dev
    // StrictMode, which mounts effects twice).
    setDraftReady(true);
    return () => {
      writer?.dispose();
      if (draftWriterRef.current === writer) draftWriterRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (initial || !draftReady || savedId.current || !draftWriterRef.current) return;
    draftWriterRef.current.schedule({ date, title, content, question, answering });
  }, [initial, draftReady, date, title, content, question, answering]);

  const hasSomething = () => Boolean(content.trim() || title.trim() || photos.length || audios.length || attachments.length || tags.length);

  // إضافة وسم: تشذيب، بلا تكرار، وحد أقصى معقول للعدد والطول.
  function addTag(raw: string) {
    // لوحة المفاتيح العربية تكتب الفاصلة «،» لا ","؛ كلاهما يفصل أكثر من
    // وسم، والتطبيع يمنع تكرار «إجازة» و«اجازة» كوسمين مختلفين سهواً.
    const candidates = raw
      .split(/[،,]/)
      .map((value) => value.trim().replace(/^#/, "").slice(0, 24))
      .filter(Boolean);
    if (!candidates.length) return;
    setTags((prev) => {
      const next = [...prev];
      const seen = new Set(prev.map((value) => normalizeArabic(value)));
      for (const candidate of candidates) {
        const key = normalizeArabic(candidate);
        if (!key || seen.has(key) || next.length >= 12) continue;
        next.push(candidate);
        seen.add(key);
      }
      return next;
    });
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
    if (draftWriterRef.current) draftWriterRef.current.clear();
    else {
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    }
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
    if (draftWriterRef.current) draftWriterRef.current.clear();
    else {
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    }
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
  function clearFormatting() {
    const ta = contentRef.current;
    if (!ta) return;
    const selectionStart = ta.selectionStart;
    const selectionEnd = ta.selectionEnd;
    const start = selectionStart === selectionEnd
      ? content.lastIndexOf("\n", selectionStart - 1) + 1
      : selectionStart;
    const nextBreak = content.indexOf("\n", selectionEnd);
    const end = selectionStart === selectionEnd
      ? (nextBreak === -1 ? content.length : nextBreak)
      : selectionEnd;
    const selected = content.slice(start, end);
    const plain = selected
      .replace(/^\s*(?:#{1,6}|>|[-*+])\s+/gmu, "")
      .replace(/\*\*|__|_/gu, "");
    setContent(content.slice(0, start) + plain + content.slice(end));
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start, start + plain.length);
    });
  }

  const titleIdeas = useMemo(
    () => suggestTitles(content, date, answering ? question : undefined),
    [content, date, answering, question]
  );

  const wordCount = content.trim() ? content.trim().split(/\s+/u).length : 0;
  // العدُّ العربيّ يمرّ بـ`arabicCount` كبقيّة التطبيق: «كلمة واحدة · كلمتان ·
  // ٣ كلمات · ١١ كلمة». الصياغةُ اليدوية كانت تكتب «٣ كلمة» في كل مذكرة.
  const wordCountLabel = arabicCount(wordCount, {
    zero: "لا كلمات بعد", one: "كلمة واحدة", two: "كلمتان", few: "كلمات", many: "كلمة",
  });
  const saveLabel = saveState === "saving"
    ? "يُحفظ الآن…"
    : saveState === "saved"
      ? "حُفظ تلقائيًا"
      : hasSomething()
        ? "مسودة محلية"
        : "ابدأ الكتابة";

  function revealExtras() {
    setShowExtras(true);
    window.setTimeout(() => extrasRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 60);
  }

  const MAX_PHOTOS = 30;
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
    <div
      className="fixed inset-0 z-[70] mdr mdr-journal-composer [animation:fadeIn_0.2s_ease_both]"
      lang="ar"
      dir="rtl"
    >
      <div
        className="absolute inset-x-0 flex flex-col bg-[var(--paper)] mdr-journal-sheet"
        style={{ top: "var(--vvo, 0px)", height: "var(--vvh, 100dvh)" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mdr-journal-composer-title"
      >
      {/* ترويسة المحرّر كما في المرجع النهائي: عودة للمذكرات وحفظ تلقائي. */}
      <header className="mdr-journal-compose-head">
        <button
          type="button"
          onClick={handleDone}
          aria-label="حفظ وإغلاق"
          className="mdr-journal-back press"
        >
          المذكرات
        </button>
        <div className={`mdr-journal-save-state ${saveState === "saved" ? "is-saved" : ""}`} aria-live="polite">
          {saveState === "saved" && <Check size={13} aria-hidden="true" />}
          <span>{saveLabel}</span>
        </div>
        <span className="mdr-journal-word-count">{wordCountLabel}</span>
      </header>

      {/* المحتوى — يمرّر داخل الشاشة */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain">
        <main className="mdr-journal-compose-body">
          <h1 id="mdr-journal-composer-title" className="sr-only">
            {initial ? "تعديل المذكرة" : "مذكرة جديدة"}
          </h1>

          <section className="mdr-journal-subject" aria-label="تاريخ المذكرة">
            <span className="mdr-journal-subject-kicker">تتحدّث عن</span>
            <details className="mdr-journal-date-context">
              <summary>
                <span>{formatDate(date)}</span>
                <ChevronDown size={14} aria-hidden="true" />
              </summary>
              <div className="mdr-journal-date-editor">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  aria-label="اختر تاريخ المذكرة"
                  lang="ar"
                  dir="rtl"
                />
                <div className="mdr-journal-date-actions">
                  <button type="button" onClick={() => setDate(today())} className={date === today() ? "is-active" : ""}>اليوم</button>
                  <button type="button" onClick={() => shiftDate(-1)}>اليوم السابق</button>
                  <button type="button" onClick={() => shiftDate(1)}>اليوم التالي</button>
                </div>
              </div>
            </details>
            <p className="mdr-journal-subject-meta">
              <span>{initial?.time ? `كُتبت الساعة ${toIndicDigits(initial.time)}` : "تُحفظ لحظة الكتابة"}</span>
              <span aria-hidden="true">·</span>
              <span>{hijriDate(date)}</span>
            </p>
          </section>

          {/* الورقة المسطّرة في النسخة النهائية؛ التنسيق ظاهر ولا يقطع الحبر. */}
          <section className="mdr-journal-editor" aria-label="ورقة المذكرة">
            <input
              value={title}
              onChange={(e) => setTitle(expandTimeCommand(e.target.value))}
              placeholder="عنوانُ المذكرة"
              aria-label="عنوان المذكرة"
              lang="ar"
              dir="rtl"
              inputMode="text"
              spellCheck
              autoCorrect="on"
              autoCapitalize="sentences"
              autoComplete="off"
              className="mdr-journal-title-input"
            />
            {!title && content.trim().length > 3 && titleIdeas.length > 0 && (
              <div className="mdr-journal-title-ideas" aria-label="عناوين مقترحة">
                <Sparkles size={13} aria-hidden="true" />
                {titleIdeas.map((suggestion) => (
                  <button key={suggestion} type="button" onClick={() => setTitle(suggestion)} className="press">
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            <div className="mdr-journal-formatting" aria-label="أدوات تنسيق النص">
              {[
                { icon: Bold, label: "عريض", action: () => wrapSelection("**") },
                { icon: Italic, label: "مائل", action: () => wrapSelection("_") },
                { icon: Heading, label: "عنوان", action: () => prefixLine("## ") },
                { icon: List, label: "قائمة", action: () => prefixLine("- ") },
                { icon: Quote, label: "اقتباس", action: () => prefixLine("> ") },
                { icon: RemoveFormatting, label: "عادي", action: clearFormatting },
              ].map((tool) => (
                <button key={tool.label} type="button" onClick={tool.action} aria-label={tool.label} title={tool.label} className="press">
                  <tool.icon size={15} aria-hidden="true" />
                  <span>{tool.label}</span>
                </button>
              ))}
            </div>
            <textarea
              ref={contentRef}
              value={content}
              onChange={(e) => setContent(expandTimeCommand(e.target.value))}
              placeholder="اكتب كما تتكلّم… هذه ورقتك."
              aria-label="نص المذكرة"
              className="mdr-journal-writing-field"
              lang="ar"
              dir="rtl"
              inputMode="text"
              spellCheck
              autoCorrect="on"
              autoCapitalize="sentences"
              autoComplete="off"
              enterKeyHint="enter"
            />
            <div className="mdr-journal-writing-hint">
              <span>اكتب <bdi dir="ltr">/الوقت</bdi> لإدراج الساعة</span>
              <span>{wordCountLabel}</span>
            </div>
          </section>

          <section className="mdr-journal-mood-row" aria-label="مزاج المذكرة">
            <div role="group" aria-label="اختر شعور هذه المذكرة">
              {MOODS.map((item) => {
                const active = mood === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setMood(active ? undefined : item.value)}
                    aria-label={item.label}
                    aria-pressed={active}
                    className={active ? "is-active press" : "press"}
                    title={item.label}
                  >
                    <span style={{ background: MOOD_SKY[item.value] }} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
            <p>{mood ? `المزاج: ${MOODS.find((item) => item.value === mood)?.label}` : "المزاجُ اختياري"}</p>
          </section>

          <section className={`mdr-journal-question-field ${answering ? "is-answering" : ""}`}>
            <div>
              <label htmlFor="mdr-journal-question">السؤالُ الذي بقي</label>
              <button type="button" onClick={() => setAnswering((value) => !value)} aria-pressed={answering}>
                {answering ? "مرفق بالمذكرة" : "إرفاق السؤال"}
              </button>
            </div>
            <input
              id="mdr-journal-question"
              value={question}
              onChange={(e) => { setQuestion(e.target.value); setAnswering(true); }}
              placeholder="اكتب سؤالًا بقي معك…"
              lang="ar"
              dir="rtl"
              inputMode="text"
              spellCheck
              autoCorrect="on"
              autoCapitalize="sentences"
              autoComplete="off"
            />
            <p>{answering ? "سيُحفظ السؤال مع هذه المذكرة." : "السؤال ظاهر للتأمل، ولن يُربط بالمذكرة حتى ترفقه."}</p>
          </section>

          <section className="mdr-journal-tags-inline" aria-label="وسوم المذكرة">
            <div className="mdr-journal-tags-head">
              <Tag size={14} aria-hidden="true" />
              <span>الوسوم</span>
              {tags.length > 0 && <small>{toIndicDigits(String(tags.length))}</small>}
            </div>
            {tags.length > 0 && (
              <div className="mdr-journal-tag-chips">
                {tags.map((item) => (
                  <button key={item} type="button" onClick={() => removeTag(item)} aria-label={`حذف الوسم ${item}`}>
                    {item} <span aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
            )}
            {tags.length < 12 && (
              <div className="mdr-journal-tag-entry">
                <input
                  value={tagInput}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (/[،,]\s*$/u.test(value)) addTag(value);
                    else setTagInput(value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "," || e.key === "،") {
                      e.preventDefault();
                      addTag(tagInput);
                    } else if (e.key === "Backspace" && !tagInput && tags.length) {
                      removeTag(tags[tags.length - 1]);
                    }
                  }}
                  onBlur={() => addTag(tagInput)}
                  placeholder="وسم عربي، أو أكثر بفاصلة «،»"
                  aria-label="إضافة وسم للمذكرة"
                  lang="ar"
                  dir="rtl"
                  inputMode="text"
                  spellCheck
                  autoCorrect="on"
                  autoComplete="off"
                />
                <button type="button" onClick={() => addTag(tagInput)} disabled={!tagInput.trim()}>أضِف</button>
              </div>
            )}
          </section>

          <section className="mdr-journal-media-entry" aria-label="وسائط المذكرة">
            {(photoSources.length > 0 || audios.length > 0 || attachments.length > 0) && (
              <div className="mdr-journal-media-counts">
                {photoSources.length > 0 && <span>{photosCount(photoSources.length)}</span>}
                {audios.length > 0 && <span>{audiosCount(audios.length)}</span>}
                {attachments.length > 0 && <span>{filesCount(attachments.length)}</span>}
              </div>
            )}
            <div>
              <button type="button" onClick={revealExtras}><ImageIcon size={16} aria-hidden="true" /> أضِف صورة</button>
              <button type="button" onClick={revealExtras}><AudioLines size={16} aria-hidden="true" /> أضِف تسجيلًا</button>
              <button type="button" onClick={revealExtras}><Paperclip size={16} aria-hidden="true" /> أضِف مرفقًا</button>
            </div>
          </section>

      {/* الصور والصوت والملفات القديمة تبقى في حقولها نفسها، بلا إعادة استيراد. */}
      <div ref={extrasRef} className="mdr-journal-extras-wrap">
        <button
          type="button"
          onClick={() => setShowExtras((v) => !v)}
          className="w-full flex items-center gap-2 text-xs font-bold text-gray-500 py-2 press mdr-journal-attachments-toggle"
        >
          <Paperclip size={14} className="text-[var(--gold)]" />
          تفاصيل الوسائط
          {(() => {
            const n = photoSources.length + audios.length + attachments.length;
            return n > 0 ? <span className="text-[10px] bg-[var(--goldw)] text-[var(--gold)] rounded-full px-2 py-0.5">{n}</span> : null;
          })()}
          <span className="text-gray-300 font-normal">صور · صوت · ملفات</span>
          <ChevronDown size={15} className={`ms-auto transition-transform ${showExtras ? "rotate-180" : ""}`} />
        </button>
        {showExtras && (
          <div className="space-y-4 mt-2 mdr-journal-attachments">
      {/* الصور: من الكاميرا أو الاستديو، حتى 30 صورة — تُضغط تلقائياً. تعرض
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

      {/* الإغلاق يحفظ تلقائياً؛ هذا الخيار الوحيد المُتلِف. */}
      <div className="pt-1">
        <button
          onClick={handleCancel}
          className="w-full py-2 text-center text-xs font-medium text-red-400 hover:text-red-500 press"
        >
          {initial ? "إلغاء التعديلات" : "تجاهل هذه المذكرة"}
        </button>
      </div>

        </main>
      </div>

      </div>
    </div>,
    document.body
  );
}
