// Orbit brand mark for "مسار" — concentric rings with an orbiting dot.
export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none" aria-hidden>
      <circle cx="22" cy="22" r="20" stroke="#e8b15a" strokeWidth="1.5" opacity="0.35" />
      <circle cx="22" cy="22" r="13" stroke="#e8b15a" strokeWidth="1.5" opacity="0.6" />
      <circle cx="22" cy="22" r="5" fill="#e8b15a" />
      <circle cx="22" cy="2.6" r="2.8" fill="#e8b15a" />
    </svg>
  );
}
