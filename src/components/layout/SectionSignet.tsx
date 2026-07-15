import { NAV_ITEMS } from "@/lib/nav";

// ترويسة موقّعة — أيقونةُ القسم بلونه (المأخوذَين من nav.ts، المصدر الوحيد)
// داخل شارةٍ صغيرة بلمسةٍ شفّافة من اللون نفسه. تُوضع بجانب عنوان كل صفحة
// رئيسية بحجمٍ وموضعٍ متّسقين لتشعر كل صفحة كأنها «غرفة» مستقلة، دون تغيير
// بنية الترويسة. الخلفية = اللون الحالي بشفافية (bg-current) فلا تعتمد على
// أصنافٍ ديناميكية قد لا يُصرّفها Tailwind.
export function SectionSignet({ href }: { href: string }) {
  const item = NAV_ITEMS.find((n) => n.href === href);
  if (!item) return null;
  const Icon = item.icon;
  return (
    <span
      className={`relative inline-flex items-center justify-center w-9 h-9 rounded-xl shrink-0 ${item.color}`}
      aria-hidden
    >
      <span className="absolute inset-0 rounded-xl bg-current opacity-[0.13]" />
      <Icon size={18} className="relative" />
    </span>
  );
}
