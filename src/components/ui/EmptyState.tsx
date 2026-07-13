"use client";

interface EmptyStateProps {
  emoji: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

// Andalusian eight-point star (najmah) — two overlapping squares — drawn as a
// soft, warm-ink backdrop behind the emoji so empty states feel crafted and
// on-theme rather than a lone glyph in a box.
function Najmah() {
  return (
    <svg
      viewBox="0 0 100 100"
      className="absolute inset-0 w-full h-full text-brand-400/30"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <rect x="24" y="24" width="52" height="52" rx="3" />
      <rect x="24" y="24" width="52" height="52" rx="3" transform="rotate(45 50 50)" />
      <circle cx="50" cy="50" r="30" strokeWidth="1" className="text-brand-400/20" />
    </svg>
  );
}

export function EmptyState({ emoji, title, subtitle, action }: EmptyStateProps) {
  return (
    <div className="text-center py-12 animate-fade-up">
      <div className="relative w-24 h-24 mx-auto mb-4 rounded-3xl bg-gradient-to-br from-brand-50 to-brand-100 dark:from-white/5 dark:to-white/5 border border-brand-200/60 dark:border-white/10 flex items-center justify-center card-shadow">
        <Najmah />
        <span className="relative text-4xl">{emoji}</span>
      </div>
      <p className="text-sm font-bold text-gray-700">{title}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{subtitle}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
