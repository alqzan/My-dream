"use client";
import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Move focus into the dialog on open and restore it to the trigger on
  // close, and trap Tab within the panel so keyboard/SR users can't wander
  // behind the backdrop.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    // Focus the first focusable control, or the panel itself as a fallback.
    const focusables = () =>
      panel
        ? Array.from(
            panel.querySelectorAll<HTMLElement>(
              'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])'
            )
          )
        : [];
    (focusables()[0] ?? panel)?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab" || !panel) return;
      const items = focusables();
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        style={{ animation: "backdropIn 0.25s ease both" }}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={cn(
          "relative bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl focus:outline-none",
          "max-sm:[animation:sheetUp_0.35s_cubic-bezier(0.16,1,0.3,1)_both]",
          "sm:[animation:scaleIn_0.25s_cubic-bezier(0.16,1,0.3,1)_both]",
          className
        )}
      >
        {/* Drag-handle hint on mobile bottom sheet */}
        <div className="sm:hidden pt-2.5 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>
        {title ? (
          <div className="flex items-center justify-between p-5 pb-4 border-b border-gray-100 sticky top-0 bg-white z-10 rounded-t-3xl">
            <h2 id={titleId} className="text-lg font-bold text-gray-900">{title}</h2>
            <button
              onClick={onClose}
              aria-label="إغلاق"
              className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 press"
            >
              <X size={18} />
            </button>
          </div>
        ) : (
          // Zero-height sticky wrapper keeps the close button pinned to the
          // top even when the content scrolls (long journal entries).
          <div className="sticky top-0 z-10 h-0 overflow-visible">
            <button
              onClick={onClose}
              className="absolute top-4 left-4 p-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 press"
              aria-label="إغلاق"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
