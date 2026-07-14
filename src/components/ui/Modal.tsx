"use client";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
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

  // Keep the latest onClose in a ref so the focus/keydown effect below can
  // depend on `open` ALONE. If it depended on onClose (a fresh arrow on every
  // parent render), any re-render — e.g. the journal auto-save touching the
  // store — would re-run the effect and yank focus back to the first field,
  // dismissing the mobile keyboard mid-typing.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

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
      if (e.key === "Escape") { onCloseRef.current(); return; }
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
  }, [open]);

  // When a field inside the sheet gains focus, glide it to the centre of the
  // visible area once the keyboard has settled — so you never type behind it.
  // The wrapper is already sized to the visual viewport, so this scrolls the
  // body (not the locked page) and lands the field comfortably above the keys.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const typing =
        t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable;
      if (!typing) return;
      window.setTimeout(() => {
        t.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 300);
    };
    panel.addEventListener("focusin", onFocusIn);
    return () => panel.removeEventListener("focusin", onFocusIn);
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    // Panel = a flex COLUMN capped to the safe viewport: a fixed header/close
    // that is ALWAYS visible, and a body that scrolls INSIDE. Earlier the whole
    // overlay scrolled with a sticky header — but on a tall screen (iPad in
    // landscape) the form outgrows the viewport, and the sticky header then
    // pins to the very top, tucked UNDER the device status bar → the close X
    // becomes unreachable and the top looks cut off. Here the header can never
    // scroll away, and the wrapper's safe-area padding keeps the whole card
    // clear of the status bar / home indicator / rounded corners on every
    // device. The card visibly floats in the backdrop, so its inner scroll is
    // obvious (the original "looks cut off on a short laptop" complaint too).
    <div className="fixed inset-0 z-50">
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        style={{ animation: "backdropIn 0.25s ease both" }}
        aria-hidden
      />
      <div
        className={cn(
          "fixed left-0 right-0 flex items-end justify-center sm:items-center",
          // Follow the VISUAL viewport (space above the on-screen keyboard) via
          // vars from ViewportWatcher, so an open keyboard never buries the
          // focused field or the buttons — the card glides up to sit above it.
          // Falls back to the full dynamic viewport before the vars are set.
          "transition-[height,transform] duration-200 ease-out",
          // Clear the device safe areas on every side. Mobile bottom-sheet
          // stays flush to the bottom edge (its content pads for the home
          // indicator); tablets/desktop get a real margin all around.
          "pt-[max(0.5rem,env(safe-area-inset-top))]",
          "pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]",
          "sm:pt-[max(1.5rem,env(safe-area-inset-top))] sm:pb-[max(1.5rem,env(safe-area-inset-bottom))]",
          "sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))]"
        )}
        style={{
          top: "var(--vvo, 0px)",
          height: "var(--vvh, 100dvh)",
        }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
          tabIndex={-1}
          className={cn(
            "relative bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg shadow-2xl focus:outline-none",
            "flex flex-col max-h-full overflow-hidden",
            "max-sm:[animation:sheetUp_0.35s_cubic-bezier(0.16,1,0.3,1)_both]",
            "sm:[animation:scaleIn_0.25s_cubic-bezier(0.16,1,0.3,1)_both]",
            className
          )}
        >
          {/* Drag-handle hint on mobile bottom sheet */}
          <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0">
            <div className="w-10 h-1 rounded-full bg-gray-200" />
          </div>
          {title ? (
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-100">
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
            // No title bar (e.g. the journal viewer): a floating close button
            // over the panel's top-left corner. It sits on the non-scrolling
            // panel, so it stays put while the body scrolls beneath it.
            <div className="shrink-0 h-0 z-10 overflow-visible">
              <button
                onClick={onClose}
                className="absolute top-3 left-3 p-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 press"
                aria-label="إغلاق"
              >
                <X size={18} />
              </button>
            </div>
          )}
          <div className="overflow-y-auto overscroll-contain px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
