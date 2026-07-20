"use client";
import { create } from "zustand";
import { useEffect } from "react";
import { Undo2 } from "lucide-react";

type Tone = "default" | "warning" | "success";

interface UndoState {
  label: string | null;
  onUndo: (() => void) | null;
  tone: Tone;
  seq: number;
  show: (label: string, onUndo: (() => void) | null, tone?: Tone) => void;
  clear: () => void;
}

// A single global snackbar. Deletes get a 5-second "تراجع" window; other
// events (e.g. a budget warning) show a plain, tinted message.
export const useUndoStore = create<UndoState>((set) => ({
  label: null,
  onUndo: null,
  tone: "default",
  seq: 0,
  show: (label, onUndo, tone = "default") => set((s) => ({ label, onUndo, tone, seq: s.seq + 1 })),
  clear: () => set({ label: null, onUndo: null, tone: "default" }),
}));

export function showUndo(label: string, onUndo: () => void) {
  useUndoStore.getState().show(label, onUndo, "default");
}

// Plain message toast (no undo). "warning" for budget/limit alerts,
// "success" for celebrations (milestones).
export function showToast(label: string, tone: Tone = "default") {
  useUndoStore.getState().show(label, null, tone);
}

export function UndoToast() {
  const { label, onUndo, tone, seq, clear } = useUndoStore();

  useEffect(() => {
    if (!label) return;
    const t = setTimeout(clear, tone === "default" ? 5000 : 6000);
    return () => clearTimeout(t);
  }, [label, seq, tone, clear]);

  // The wrapper is ALWAYS mounted and is an aria-live region (§14): screen
  // readers announce whatever text is inserted into it — sync warnings, undo
  // prompts, saves — instead of a toast that flashes silently. `assertive` for
  // warnings (need attention now), `polite` otherwise.
  return (
    <div
      className="fixed bottom-20 lg:bottom-6 inset-x-0 z-[60] flex justify-center px-4 pointer-events-none"
      role="status"
      aria-live={tone === "warning" ? "assertive" : "polite"}
    >
      {label && (
        <div
          className={
            "pointer-events-auto flex items-center gap-3 text-white text-sm rounded-2xl px-4 py-2.5 shadow-lg animate-fade-up backdrop-blur " +
            (tone === "warning"
              ? "bg-amber-600/95"
              : tone === "success"
              ? "bg-finance/95"
              : "bg-gray-900/95 dark:bg-[#3a2e1e]")
          }
        >
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
      )}
    </div>
  );
}
