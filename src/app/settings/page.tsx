"use client";
import { BackupCard } from "@/components/settings/BackupCard";
import { BudgetWindowCard } from "@/components/settings/BudgetWindowCard";
import { EventsCard } from "@/components/settings/EventsCard";
import { DataHealthCard } from "@/components/settings/DataHealthCard";
import { NavCustomizeCard } from "@/components/settings/NavCustomizeCard";
import { LockCard } from "@/components/settings/LockCard";
import { SyncKeyCard } from "@/components/settings/SyncKeyCard";
import { AiExportCard } from "@/components/settings/AiExportCard";
import { ThemePreferencesCard } from "@/components/settings/ThemePreferencesCard";
import { BrandMark } from "@/components/layout/BrandMark";
// الإصدار من مصدره الوحيد (src/lib/version.ts) — لا رقمَ مكتوباً بيدٍ هنا يتخلّف
// عن package.json. الرقم = عدد التعديلات الجوهرية منذ أوّل نسخة مستقرة.
import { APP_VERSION, APP_BUILD } from "@/lib/version";

// Home for device-level controls that aren't statistics — backups, the
// privacy lock, and the sync key. They used to live at the bottom of /stats;
// this page gives them their own place in the IA.
export default function SettingsPage() {
  return (
    <div className="page-shell">
      <div className="animate-fade-up">
        <h1 className="page-title">الإعدادات</h1>
        <p className="page-subtitle">الأحداث المهمّة، حساب السقوف، النسخ الاحتياطي، القفل، ومفتاح المزامنة</p>
      </div>

      {/* مرساةُ الرابط القادم من بطاقة الرئيسية (/settings#events). */}
      <div id="events" className="animate-fade-up stagger-1 scroll-mt-20">
        <EventsCard />
      </div>
      <div className="animate-fade-up stagger-1">
        <ThemePreferencesCard />
      </div>
      <div className="animate-fade-up stagger-1">
        <BudgetWindowCard />
      </div>
      <div className="animate-fade-up stagger-1">
        <BackupCard />
      </div>
      <div className="animate-fade-up stagger-2">
        <AiExportCard />
      </div>
      <div className="animate-fade-up stagger-2">
        <DataHealthCard />
      </div>
      <div className="animate-fade-up stagger-2">
        <NavCustomizeCard />
      </div>
      <div className="animate-fade-up stagger-3">
        <LockCard />
      </div>
      <div className="animate-fade-up stagger-4">
        <SyncKeyCard />
      </div>

      {/* تذييلٌ هادئ يوازن صفحةً قليلة البطاقات — علامة المدار الساكنة، الاسم،
          ثم سطرٌ مكتومٌ بالشعار والإصدار. بخطّ التطبيق (ثمانية) وألوانٍ باهتة
          في الوضعين. */}
      <footer className="pt-6 pb-2 flex flex-col items-center gap-1.5 animate-fade-up stagger-4">
        <BrandMark size={30} />
        <p className="text-base font-bold text-gray-500 dark:text-gray-400">مدار</p>
        {/* رقمُ الإصدار **معرّفٌ لا كمّية** — يبقى لاتينياً كما يُكتب في
            package.json وفي الوسوم، فيُقارَن ويُنسخ كما هو. */}
        <p className="text-xs text-gray-400">
          مساحتك الشخصية · الإصدار <span data-digits="latin">{APP_VERSION}</span>
        </p>
        <p className="text-[10px] text-gray-300 dark:text-gray-500">التعديل رقم {APP_BUILD} منذ أوّل نسخة مستقرة</p>
      </footer>
    </div>
  );
}
