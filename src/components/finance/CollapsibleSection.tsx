"use client";
import { useId } from "react";
import { ChevronDown } from "lucide-react";

// قسمٌ قابل للطيّ لصفحة الأموال: رأسٌ بعنوانٍ وملخّصٍ صغيرٍ وشارة تحذيرٍ اختيارية
// (تبقى ظاهرةً حتى وهو مطويّ، فلا تُدفَن تحذيرات)، وجسمٌ يُخفى بـhidden فيبقى
// مركّباً (كما كانت الصفحة) وتصحّ إشارة aria-controls. هدف اللمس ≥44px.
export function CollapsibleSection({
  id, title, icon, summary, badge, open, onToggle, children,
}: {
  id?: string;
  title: string;
  icon?: React.ReactNode;
  summary?: React.ReactNode;
  badge?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const panelId = useId();
  return (
    <div id={id} className="scroll-mt-24">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="w-full min-h-[44px] flex items-center gap-2 bg-white rounded-2xl border border-gray-100 card-shadow px-4 py-3 press text-right"
      >
        {icon && <span className="text-finance shrink-0">{icon}</span>}
        <div className="flex-1 min-w-0 flex items-baseline gap-2">
          <span className="text-sm font-bold text-gray-800 shrink-0">{title}</span>
          {summary && <span className="text-xs text-gray-400 truncate">{summary}</span>}
        </div>
        {badge}
        <ChevronDown size={18} className={`shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <div id={panelId} hidden={!open} className="mt-2 space-y-2">
        {children}
      </div>
    </div>
  );
}
