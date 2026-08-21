"use client";

import { useState } from "react";
import { AppImage } from "@/components/ui/AppImage";
import type { JournalPhotoEdit } from "@/lib/types";
import { DEFAULT_PHOTO_EDIT, normalizePhotoEdit, photoEditTransform } from "@/lib/photoEdits";
import { Check, FlipHorizontal2, FlipVertical2, Minus, Plus, RotateCcw, RotateCw, X } from "lucide-react";

/** ورقة تحرير بسيطة للصورة — تحفظ transform فقط ولا تستبدل البايتات الأصلية. */
export function JournalPhotoEditor({
  src,
  initial,
  label,
  onSave,
  onClose,
}: {
  src: string;
  initial?: JournalPhotoEdit;
  label: string;
  onSave: (edit: JournalPhotoEdit) => void;
  onClose: () => void;
}) {
  const [edit, setEdit] = useState<JournalPhotoEdit>(normalizePhotoEdit(initial));

  function patch(next: Partial<JournalPhotoEdit>) {
    setEdit((prev) => normalizePhotoEdit({ ...prev, ...next }));
  }

  function rotate(delta: number) {
    const current = normalizePhotoEdit(edit).rotation ?? 0;
    patch({ rotation: (((current + delta + 360) % 360) as 0 | 90 | 180 | 270) });
  }

  function shift(axis: "offsetX" | "offsetY", delta: number) {
    const current = normalizePhotoEdit(edit)[axis] ?? 0;
    patch({ [axis]: current + delta });
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3" role="dialog" aria-modal="true" aria-label="تحرير الصورة">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-[var(--gline)] bg-[var(--paper)] shadow-2xl">
        <div className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-[var(--ink52)] press" aria-label="إغلاق">
            <X size={19} />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="text-sm font-black text-[var(--ink)]">تحرير الصورة</p>
            <p className="mt-0.5 truncate text-[10px] text-[var(--ink52)]">{label} · الأصل محفوظ</p>
          </div>
          <button
            type="button"
            onClick={() => { onSave(normalizePhotoEdit(edit)); onClose(); }}
            className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-[var(--ink)] px-3 text-xs font-black text-[var(--paper)] press"
          >
            <Check size={15} /> حفظ
          </button>
        </div>

        <div className="p-4">
          <div className="relative h-[min(58vh,24rem)] overflow-hidden rounded-2xl border border-[var(--line)] bg-[#201a14]">
            <AppImage
              src={src}
              alt={label}
              className="absolute inset-0 h-full w-full object-contain transition-transform duration-150"
              style={{ transform: photoEditTransform(edit) }}
            />
            <span className="pointer-events-none absolute bottom-2 start-2 rounded-full bg-black/45 px-2 py-1 text-[10px] text-white/80">
              كبّر لتغيير إطار القص
            </span>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2">
            <Control label="تدوير يسار" onClick={() => rotate(-90)}><RotateCcw size={17} /></Control>
            <Control label="تدوير يمين" onClick={() => rotate(90)}><RotateCw size={17} /></Control>
            <Control label="قلب أفقي" onClick={() => patch({ flipX: !edit.flipX })}><FlipHorizontal2 size={17} /></Control>
            <Control label="قلب رأسي" onClick={() => patch({ flipY: !edit.flipY })}><FlipVertical2 size={17} /></Control>
          </div>

          <div className="mt-2 flex items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--paper2)] p-2">
            <span className="px-1 text-[11px] font-bold text-[var(--ink52)]">الإطار</span>
            <Control label="تصغير" onClick={() => patch({ scale: (edit.scale ?? 1) - 0.1 })}><Minus size={16} /></Control>
            <span className="min-w-12 text-center text-xs font-black text-[var(--ink)]">{Math.round((edit.scale ?? 1) * 100)}٪</span>
            <Control label="تكبير" onClick={() => patch({ scale: (edit.scale ?? 1) + 0.1 })}><Plus size={16} /></Control>
            <span className="ms-auto flex items-center gap-1">
              <Control label="حرّك يسار" onClick={() => shift("offsetX", -4)}><span aria-hidden>←</span></Control>
              <Control label="حرّك يمين" onClick={() => shift("offsetX", 4)}><span aria-hidden>→</span></Control>
              <Control label="حرّك أعلى" onClick={() => shift("offsetY", -4)}><span aria-hidden>↑</span></Control>
              <Control label="حرّك أسفل" onClick={() => shift("offsetY", 4)}><span aria-hidden>↓</span></Control>
            </span>
          </div>

          <button
            type="button"
            onClick={() => setEdit(DEFAULT_PHOTO_EDIT)}
            className="mt-3 w-full rounded-xl border border-[var(--line)] py-2 text-xs font-bold text-[var(--ink52)] press"
          >
            إعادة الصورة كما كانت
          </button>
        </div>
      </div>
    </div>
  );
}

function Control({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="flex min-h-9 flex-1 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--paper)] px-2 text-sm font-bold text-[var(--ink72)] press hover:border-[var(--gline)] hover:text-[var(--gold)]"
    >
      {children}
    </button>
  );
}

