import type { ElementType } from "react";
import { BookOpen, Wallet, BookMarked, LayoutDashboard, BarChart3 } from "lucide-react";
import { MosqueIcon } from "@/components/icons/MosqueIcon";
import { QuranIcon } from "@/components/icons/QuranIcon";

// Single source of truth for the app's primary navigation, shared by the
// desktop Sidebar and the mobile bottom nav so their labels never drift
// apart. `color` is the active-state tint used by the sidebar. `ElementType`
// covers both lucide glyphs and the custom MosqueIcon; both are rendered as
// <item.icon size={..} className={..} />.
export interface NavItem {
  href: string;
  icon: ElementType;
  label: string;
  // Optional shorter label for the cramped mobile bottom bar (falls back to
  // `label`). Keeps the sidebar's full wording while the phone stays legible.
  shortLabel?: string;
  color: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", icon: LayoutDashboard, label: "الرئيسية", color: "text-gray-700" },
  { href: "/prayers", icon: MosqueIcon, label: "الصلاة", color: "text-prayer" },
  { href: "/journal", icon: BookMarked, label: "المذكرات", color: "text-journal" },
  { href: "/finance", icon: Wallet, label: "الأموال", color: "text-finance" },
  { href: "/reading", icon: BookOpen, label: "القراءة", color: "text-reading" },
  { href: "/quran", icon: QuranIcon, label: "قرآن", color: "text-quran" },
  { href: "/stats", icon: BarChart3, label: "الإحصائيات", shortLabel: "إحصاء", color: "text-brand-600" },
];
