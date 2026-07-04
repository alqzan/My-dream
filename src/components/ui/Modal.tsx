"use client";
import { useEffect } from "react";
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
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
        className={cn(
          "relative bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl",
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
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 press"
            >
              <X size={18} />
            </button>
          </div>
        ) : (
          <button
            onClick={onClose}
            className="absolute top-4 left-4 z-10 p-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 press"
            aria-label="إغلاق"
          >
            <X size={18} />
          </button>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
