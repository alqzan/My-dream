"use client";

interface EmptyStateProps {
  emoji: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function EmptyState({ emoji, title, subtitle, action }: EmptyStateProps) {
  return (
    <div className="text-center py-12 animate-fade-up">
      <div className="w-20 h-20 mx-auto mb-4 rounded-3xl bg-gradient-to-br from-brand-50 to-brand-100 dark:from-white/5 dark:to-white/5 border border-brand-200/60 dark:border-white/10 flex items-center justify-center text-4xl card-shadow">
        {emoji}
      </div>
      <p className="text-sm font-bold text-gray-700">{title}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{subtitle}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
