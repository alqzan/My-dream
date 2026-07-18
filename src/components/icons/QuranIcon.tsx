// Minimal open-mushaf silhouette (an open book on a small stand, with a subtle
// crescent above) — lucide's BookOpen reads as generic reading; this glyph
// carries the قرآن section's own identity, a sibling to MosqueIcon.
export function QuranIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {/* crescent above the book */}
      <path d="M13.4 3.6a2.2 2.2 0 1 0 2 3.3 2.7 2.7 0 0 1-2-3.3Z" fill="currentColor" stroke="none" />
      {/* open pages */}
      <path d="M12 9.2c-1.4-1-3-1.5-5-1.5-.8 0-1.5.1-2 .3v9c.5-.2 1.2-.3 2-.3 2 0 3.6.5 5 1.5" />
      <path d="M12 9.2c1.4-1 3-1.5 5-1.5.8 0 1.5.1 2 .3v9c-.5-.2-1.2-.3-2-.3-2 0-3.6.5-5 1.5" />
      <path d="M12 9.2v9" />
      {/* stand / rest */}
      <path d="M4 19.5 12 21l8-1.5" />
    </svg>
  );
}
