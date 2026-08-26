"use client";

import type { JournalAttachment } from "@/lib/types";
import type { MediaSource } from "@/lib/mediaSources";
import { isSafeMediaUrl } from "@/lib/mediaUrl";
import { useMediaCacheVersion, resolveMedia } from "@/components/ui/useMedia";
import { AppImage } from "@/components/ui/AppImage";
import { Download, ExternalLink, FileText, Paperclip } from "lucide-react";

function formatBytes(size?: number): string | null {
  if (!size || !Number.isFinite(size)) return null;
  if (size < 1024) return `${size} ب`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} ك.ب`;
  return `${(size / (1024 * 1024)).toFixed(1)} م.ب`;
}

function attachmentSource(attachment: JournalAttachment): MediaSource[] {
  if (attachment.localData) return [{ inline: attachment.localData }];
  if (attachment.hash) return [{ hash: attachment.hash, kind: "photos" }];
  return [];
}

function previewSource(attachment: JournalAttachment): MediaSource[] {
  return attachment.previewHash
    ? [{ hash: attachment.previewHash, kind: "photos" }]
    : [];
}

function firstSafeMediaUrl(sources: MediaSource[]): string | null {
  const url = resolveMedia(sources)[0];
  return isSafeMediaUrl(url) ? url : null;
}

function statusLabel(attachment: JournalAttachment, hasFile: boolean, hasPreview: boolean): string {
  const typeLabel = attachment.kind === "pdf" ? "PDF" : "الملف";
  if (hasFile) return `${typeLabel} جاهز للفتح`;
  if (hasPreview) return "معاينة محفوظة من Day One";
  if (attachment.status === "metadataOnly") return "اسم المرفق محفوظ — الملف الأصلي غير مرفوع";
  if (attachment.status === "missing" || attachment.status === "failed") return "تعذّر حفظ الملف الأصلي";
  return `مرفق ${typeLabel}`;
}

/** مكانٌ واحدٌ واضح لملفات المذكرة المفتوحة.
 * يدعم مرفقات Day One القديمة (اسم + معاينة) والمرفقات التي تحمل بايتات فعلية
 * فعلية، ويجلب المرجع عند فتح المذكرة فقط حتى لا نحمّل أرشيف المستخدم كله. */
export function JournalAttachments({ attachments }: { attachments?: JournalAttachment[] }) {
  useMediaCacheVersion();
  if (!attachments?.length) return null;

  return (
    <section className="mdr-attachment-card rounded-2xl border border-journal/15 bg-journal/[0.04] p-3.5 space-y-2.5" aria-label="ملفات المذكرة">
      <div className="flex items-center gap-2 text-sm font-bold text-gray-800">
        <Paperclip size={15} className="text-[var(--gold)]" />
        ملفات المذكرة
        <span className="text-[11px] font-normal text-gray-400">({attachments.length})</span>
      </div>

      <div className="space-y-2">
        {attachments.map((attachment, index) => {
          const fileUrl = firstSafeMediaUrl(attachmentSource(attachment));
          const previewUrl = firstSafeMediaUrl(previewSource(attachment));
          const filename = attachment.filename || `ملف PDF ${index + 1}`;
          const size = formatBytes(attachment.size);
          return (
            <div key={attachment.sourceMediaID ?? `${filename}-${index}`} className="flex items-center gap-2.5 rounded-xl bg-white/80 dark:bg-[#241c12] border border-gray-100 dark:border-transparent px-2.5 py-2">
              {previewUrl ? (
                <AppImage src={previewUrl} alt="" className="w-11 h-14 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-11 h-14 rounded-lg bg-red-50 text-red-500 flex flex-col items-center justify-center shrink-0">
                  <FileText size={20} />
                  <span className="text-[8px] font-black mt-0.5">{attachment.kind === "pdf" ? "PDF" : "FILE"}</span>
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-gray-800 truncate" title={filename}>{filename}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {statusLabel(attachment, Boolean(fileUrl), Boolean(previewUrl))}
                  {size ? ` · ${size}` : ""}
                </p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {fileUrl && (
                    <>
                      <a
                        href={fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--gold)] hover:text-[var(--clay)] press"
                      >
                        <ExternalLink size={12} /> فتح الملف
                      </a>
                      <a
                        href={fileUrl}
                        download={filename}
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-500 hover:text-[var(--gold)] press"
                      >
                        <Download size={12} /> تحميل
                      </a>
                    </>
                  )}
                  {!fileUrl && previewUrl && (
                    <a
                      href={previewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-500 hover:text-[var(--gold)] press"
                    >
                      <ExternalLink size={12} /> عرض المعاينة
                    </a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
