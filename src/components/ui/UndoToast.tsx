"use client";
import { create } from "zustand";
import { useEffect } from "react";
import { Undo2 } from "lucide-react";

interface UndoState {
  label: string | null;
  onUndo: (() => void) | null;
  seq: number;
  show: (label: string, onUndo: () => void) => void;
  clear: () => void;
}

// A single global "تراجع" snackbar. Deletes stay instant, but the user
// gets a 5-second window to take them back — no confirmation dialogs.
export const useUndoStore = create<UndoState>((set) => ({
  label: null,
  onUndo: null,
  seq: 0,
  show: (label, onUndo) => set((s) => ({ label, onUndo, seq: s.seq + 1 })),
  clear: () => set({ label: null, onUndo: null }),
}));

export function showUndo(label: string, onUndo: () => void) {
  useUndoStore.getState().show(label, onUndo);
}

export function UndoToast() {
  const { label, onUndo, seq, clear } = useUndoStore();

  useEffect(() => {
    if (!label) return;
    const t = setTimeout(clear, 5000);
    return () => clearTimeout(t);
  }, [label, seq, clear]);

  if (!label) return null;

  return (
    <div className="fixed bottom-20 lg:bottom-6 inset-x-0 z-[60] flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-3 bg-gray-900/95 dark:bg-[#3a2e1e] text-white text-sm rounded-2xl px-4 py-2.5 shadow-lg animate-fade-up backdrop-blur">
        <span>{label}</span>
        {onUndo && (
          <button
            onClick={() => {
              onUndo();
              clear();
            }}
            className="flex items-center gap-1 font-bold text-amber-300 press"
          >
            <Undo2 size={14} /> تراجع
          </button>
        )}
      </div>
    </div>
  );
}
