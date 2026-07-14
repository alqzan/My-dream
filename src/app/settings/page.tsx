"use client";
import { BackupCard } from "@/components/settings/BackupCard";
import { LockCard } from "@/components/settings/LockCard";
import { SyncKeyCard } from "@/components/settings/SyncKeyCard";

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
        <LockCard />
      </div>
      <div className="animate-fade-up stagger-3">
        <SyncKeyCard />
      </div>
    </div>
  );
}
