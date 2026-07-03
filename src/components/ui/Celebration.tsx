"use client";
import { useEffect, useRef, useState } from "react";

const COLORS = ["#e8b15a", "#c9852a", "#1f7a6c", "#8a6fb0", "#c1663f", "#3d9640"];

interface Piece {
  id: number;
  color: string;
  cx: string; // final x offset
  cy: string; // final y offset
  cr: string; // final rotation
  delay: string;
}

function makePieces(count: number): Piece[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    color: COLORS[i % COLORS.length],
    cx: `${(Math.random() - 0.5) * 320}px`,
    cy: `${120 + Math.random() * 260}px`,
    cr: `${(Math.random() - 0.5) * 720}deg`,
    delay: `${Math.random() * 0.25}s`,
  }));
}

// Fire a burst of confetti whenever `trigger` flips from false to true.
// Pure CSS animation — no canvas, no dependencies, auto-cleans after ~2s.
export function Celebration({ trigger }: { trigger: boolean }) {
  const [pieces, setPieces] = useState<Piece[] | null>(null);
  const prev = useRef(trigger);

  useEffect(() => {
    if (trigger && !prev.current) {
      setPieces(makePieces(26));
      const t = setTimeout(() => setPieces(null), 2100);
      return () => clearTimeout(t);
    }
    prev.current = trigger;
  }, [trigger]);

  if (!pieces) return null;

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            backgroundColor: p.color,
            animationDelay: p.delay,
            ["--cx" as string]: p.cx,
            ["--cy" as string]: p.cy,
            ["--cr" as string]: p.cr,
          }}
        />
      ))}
    </div>
  );
}
