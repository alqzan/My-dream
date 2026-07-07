"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

const MIN_SCALE = 1;
const MAX_SCALE = 5;

interface Pt {
  x: number;
  y: number;
}

/**
 * Full-screen photo viewer with pinch / wheel / double-tap zoom, drag-to-pan,
 * and left/right navigation across a set of images.
 */
export function ImageLightbox({
  images,
  index,
  onClose,
}: {
  images: string[];
  index: number;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [i, setI] = useState(index);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);

  const frameRef = useRef<HTMLDivElement>(null);
  const pointers = useRef<Map<number, Pt>>(new Map());
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const scaleRef = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);

  useEffect(() => {
    scaleRef.current = scale;
    txRef.current = tx;
    tyRef.current = ty;
  }, [scale, tx, ty]);

  useEffect(() => setMounted(true), []);

  const reset = useCallback(() => {
    setScale(1);
    setTx(0);
    setTy(0);
  }, []);

  const go = useCallback(
    (dir: number) => {
      setI((prev) => {
        const next = prev + dir;
        if (next < 0 || next >= images.length) return prev;
        reset();
        return next;
      });
    },
    [images.length, reset]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(-1); // RTL: right = previous
      else if (e.key === "ArrowLeft") go(1);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, go]);

  const center = () => {
    const r = frameRef.current?.getBoundingClientRect();
    return r ? { cx: r.left + r.width / 2, cy: r.top + r.height / 2 } : { cx: 0, cy: 0 };
  };

  const zoomAt = useCallback((clientX: number, clientY: number, next: number) => {
    const s2 = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    const { cx, cy } = center();
    const s = scaleRef.current;
    const px = clientX - cx;
    const py = clientY - cy;
    if (s2 === MIN_SCALE) {
      setScale(1);
      setTx(0);
      setTy(0);
      return;
    }
    setScale(s2);
    setTx(px - (s2 * (px - txRef.current)) / s);
    setTy(py - (s2 * (py - tyRef.current)) / s);
  }, []);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, scaleRef.current * (e.deltaY < 0 ? 1.15 : 0.87));
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    zoomAt(e.clientX, e.clientY, scaleRef.current > 1.2 ? 1 : 2.5);
  };

  const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const swipeStart = useRef<Pt | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) swipeStart.current = { x: e.clientX, y: e.clientY };
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: dist(a, b), scale: scaleRef.current };
      swipeStart.current = null;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);

    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const m = mid(a, b);
      zoomAt(m.x, m.y, (pinch.current.scale * dist(a, b)) / pinch.current.dist);
    } else if (pointers.current.size === 1 && scaleRef.current > 1) {
      setTx(txRef.current + (cur.x - prev.x));
      setTy(tyRef.current + (cur.y - prev.y));
    }
  };

  const endPointer = (e: React.PointerEvent) => {
    const start = swipeStart.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    // A horizontal flick at rest (not zoomed) navigates between images.
    if (start && scaleRef.current <= 1.05 && images.length > 1) {
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
    }
    swipeStart.current = null;
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center select-none touch-none animate-[fadeIn_0.15s_ease]"
      onClick={(e) => {
        if (e.target === e.currentTarget && scaleRef.current <= 1.05) onClose();
      }}
    >
      <button
        onClick={onClose}
        className="absolute top-4 left-4 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
        aria-label="إغلاق"
      >
        <X size={22} />
      </button>

      {images.length > 1 && (
        <span className="absolute top-5 right-5 z-10 text-white/70 text-xs font-medium">
          {i + 1} / {images.length}
        </span>
      )}

      <div
        ref={frameRef}
        className="w-full h-full flex items-center justify-center overflow-hidden"
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        style={{ cursor: scale > 1 ? "grab" : "zoom-in" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={images[i]}
          alt=""
          draggable={false}
          className="max-w-full max-h-full object-contain will-change-transform"
          style={{
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            transition: pointers.current.size ? "none" : "transform 0.12s ease-out",
          }}
        />
      </div>

      {images.length > 1 && (
        <>
          <button
            onClick={() => go(-1)}
            disabled={i === 0}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 transition-colors"
            aria-label="السابقة"
          >
            <ChevronRight size={26} />
          </button>
          <button
            onClick={() => go(1)}
            disabled={i === images.length - 1}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 transition-colors"
            aria-label="التالية"
          >
            <ChevronLeft size={26} />
          </button>
        </>
      )}

      <div className="absolute bottom-5 inset-x-0 text-center text-white/60 text-xs pointer-events-none">
        اضغط ضغطتين للتكبير · اسحب للتنقّل
      </div>
    </div>,
    document.body
  );
}
