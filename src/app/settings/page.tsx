"use client";
import { BackupCard } from "@/components/settings/BackupCard";
import { DataHealthCard } from "@/components/settings/DataHealthCard";
import { LockCard } from "@/components/settings/LockCard";
import { SyncKeyCard } from "@/components/settings/SyncKeyCard";
import { BrandMark } from "@/components/layout/BrandMark";

// Keep in step with package.json's version when it bumps.
const APP_VERSION = "0.1.0";

// Home for device-level controls that aren't statistics — backups, the
// privacy lock, and the sync key. They used to live at the bottom of /stats;
// this page gives them their own place in the IA.
export default function SettingsPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div className="animate-fade-up">
        <h1 className="text-2xl font-bold text-gray-900">الإعدادات</h1>
        <p className="text-sm text-gray-500 mt-0.5">النسخ الاحتياطي، القفل، ومفتاح المزامنة</p>
      </div>

      <div className="animate-fade-up stagger-1">
        <BackupCard />
      </div>
      <div className="animate-fade-up stagger-2">
        <DataHealthCard />
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
        <p className="text-xs text-gray-400">مساحتك الشخصية · الإصدار {APP_VERSION}</p>
      </footer>
    </div>
  );
}
