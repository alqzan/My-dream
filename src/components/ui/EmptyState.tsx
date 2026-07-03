"use client";

// A friendlier empty state than a lone emoji: the app's khatim star motif
// framing the icon, with title + hint beneath.
export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: string;
  title: string;
  hint?: string;
}) {
  return (
    <div className="text-center py-12">
      <div className="relative w-24 h-24 mx-auto mb-4">
        <svg viewBox="0 0 60 60" className="absolute inset-0 w-full h-full text-brand-300 opacity-40" aria-hidden>
          <g fill="none" stroke="currentColor" strokeWidth="1">
            <polygon points="17.6,0 42.4,0 60,17.6 60,42.4 42.4,60 17.6,60 0,42.4 0,17.6" />
            <path d="M17.6,0 L60,42.4 L0,42.4 L42.4,0 L42.4,60 L0,17.6 L60,17.6 L17.6,60 Z" />
          </g>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-4xl">{icon}</div>
      </div>
      <p className="text-sm font-semibold text-gray-500">{title}</p>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}
