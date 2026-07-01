"use client";
import { useEffect, useState } from "react";

const COLORS = ["#e8b15a", "#c9852a", "#c1663f", "#8a6fb0", "#3d9640", "#f0e2c8"];

interface Piece {
  left: number;
  delay: number;
  duration: number;
  color: string;
  size: number;
  round: boolean;
}

// Lightweight CSS confetti burst — renders once then unmounts itself.
export function Confetti({ pieces = 60 }: { pieces?: number }) {
  const [items, setItems] = useState<Piece[]>([]);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    setItems(
      Array.from({ length: pieces }, () => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.8,
        duration: 2.4 + Math.random() * 1.8,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        size: 6 + Math.random() * 6,
        round: Math.random() > 0.5,
      }))
    );
    const t = setTimeout(() => setGone(true), 5200);
    return () => clearTimeout(t);
  }, [pieces]);

  if (gone) return null;

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none overflow-hidden" aria-hidden>
      {items.map((p, i) => (
        <span
          key={i}
          className="absolute top-0"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * (p.round ? 1 : 0.5),
            backgroundColor: p.color,
            borderRadius: p.round ? "50%" : 2,
            animation: `confettiFall ${p.duration}s linear ${p.delay}s both`,
          }}
        />
      ))}
    </div>
  );
}
