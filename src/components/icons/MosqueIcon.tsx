// Minimal mosque silhouette (dome + crescent + twin minarets) — lucide has no
// equivalent glyph, and a generic icon wouldn't fit the Andalusian theme.
export function MosqueIcon({ size = 20, className }: { size?: number; className?: string }) {
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
      <path d="M12 2.5c-1.2 1-1.6 2-1.2 3 .3.7 1 .9 1.2.2.2.7.9.5 1.2-.2.4-1-.0-2-1.2-3Z" fill="currentColor" stroke="none" />
      <path d="M9 8.5a3 3 0 0 1 6 0v2.5H9V8.5Z" />
      <path d="M4 12.5a2 2 0 0 1 4 0V14H4v-1.5Z" />
      <path d="M16 12.5a2 2 0 0 1 4 0V14h-4v-1.5Z" />
      <path d="M2 21v-3.5C2 15 3.5 14 6 14s4 1 4 3.5V21" />
      <path d="M14 21v-3.5c0-2.5 1.5-3.5 4-3.5s4 1 4 3.5V21" />
      <path d="M9 21v-5a3 3 0 0 1 6 0v5" />
      <path d="M2 21h20" />
    </svg>
  );
}
