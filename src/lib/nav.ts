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
  // لونُ القسم في حالة النشاط — يشترك فيه الشريط الجانبي والشريط السفلي، فلا
  // يظهر القسمُ الواحد بهويّتين. `tint` خلفيةُ حبّة الأيقونة في الجوّال بالدرجة
  // نفسها. كان الشريط السفلي يستعمل الذهبيّ العلاماتيّ لكلّ الأقسام، فيبدو
  // «قرآن» أخضرَ على الحاسوب وذهبياً على الجوّال.
  color: string;
  tint: string;
}

export const NAV_ITEMS: NavItem[] = [
  // الرئيسية والإحصائيات لا قسمَ لهما، فيأخذان لون العلامة نفسه. (كانت
  // الرئيسية `text-gray-700` — لونٌ محايد لا يقرأ «نشِطاً» في شريطٍ سفليّ.)
  { href: "/", icon: LayoutDashboard, label: "اليوم", color: "text-brand-600", tint: "bg-brand-500/15" },
  { href: "/prayers", icon: MosqueIcon, label: "الصلاة", color: "text-prayer", tint: "bg-prayer/10" },
  { href: "/journal", icon: BookMarked, label: "المذكرات", color: "text-journal", tint: "bg-journal/10" },
  { href: "/finance", icon: Wallet, label: "المال", color: "text-finance", tint: "bg-finance/10" },
  // «المحبرة» لا «القراءة»: الباب صار مسارَ معرفةٍ (مصدرٌ ← فائدةٌ ← سؤالٌ ←
  // تطبيق) والكتبُ رفٌّ داخله، لا العكس. المسار `/reading` كما هو فلا تنكسر
  // الروابطُ المحفوظة ولا اختصارُ PWA.
  { href: "/reading", icon: BookOpen, label: "المحبرة", color: "text-reading", tint: "bg-reading/10" },
  { href: "/quran", icon: QuranIcon, label: "القرآن", color: "text-quran", tint: "bg-quran/10" },
  { href: "/stats", icon: BarChart3, label: "الإحصائيات", shortLabel: "إحصاء", color: "text-brand-600", tint: "bg-brand-500/15" },
];
