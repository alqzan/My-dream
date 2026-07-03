"use client";
import { useEffect, useRef, useState } from "react";

// Counts up (or down) to `value` with an ease-out sweep whenever it changes.
// Formatting is delegated so callers keep their locale/decimals conventions.
export function AnimatedNumber({
  value,
  format = (v) => Math.round(v).toLocaleString("ar-SA-u-nu-latn"),
  duration = 700,
}: {
  value: number;
  format?: (v: number) => string;
  duration?: number;
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (value - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      fromRef.current = value;
    };
  }, [value, duration]);

  return <>{format(display)}</>;
}
