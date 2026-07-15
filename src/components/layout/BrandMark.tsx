// Orbit brand mark for "مدار" — concentric rings with an orbiting dot.
// `spin` sets the dot orbiting (reuses @keyframes orbitDot via the
// `.brand-orbit-dot` class, which respects prefers-reduced-motion). It
// defaults off, so every existing call site renders byte-identically.
export function BrandMark({ size = 40, spin = false }: { size?: number; spin?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none" aria-hidden>
      <circle cx="22" cy="22" r="20" stroke="#e8b15a" strokeWidth="1.5" opacity="0.35" />
      <circle cx="22" cy="22" r="13" stroke="#e8b15a" strokeWidth="1.5" opacity="0.6" />
      <circle cx="22" cy="22" r="5" fill="#e8b15a" />
      <circle cx="22" cy="2.6" r="2.8" fill="#e8b15a" className={spin ? "brand-orbit-dot" : undefined} />
    </svg>
  );
}
