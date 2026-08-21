"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import type { PrayerStatus } from "@/lib/types";
import { computePrayerTimes, getCachedCoords, getPrayerLog, parseDate, today, formatClock } from "@/lib/utils";
import { duePrayerReminders, type PrayerReminderCandidate } from "@/lib/prayerReminder";
import { Modal } from "@/components/ui/Modal";
import { MdrButton } from "@/components/madar/primitives";
import { arClock } from "@/lib/madar/format";
import { usePending } from "@/lib/pending";

const STORAGE_KEY = "madar-prayer-reminders-v1";
const SNOOZE_MS = 30 * 60 * 1000;

type SnoozeMap = Record<string, number>;

function readSnoozes(): SnoozeMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: SnoozeMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function writeSnoozes(snoozes: SnoozeMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snoozes));
  } catch {
    // Storage can be unavailable in private browsing; the reminder still
    // works for the current render and is re-evaluated on the next tick.
  }
}

function prayerLabel(prayer: PrayerReminderCandidate): string {
  return `${prayer.prayer} (${arClock(prayer.adhanAt, formatClock)})`;
}

/**
 * مطالبةٌ عامةٌ خفيفة: بعد نصف ساعة من كل أذانٍ غير مسجّل، تسأل عن طريقة
 * الصلاة. تعمل حين تكون الصفحة مفتوحة، وتلحق بالصلوات التي فات وقت تذكيرها
 * عند فتح التطبيق أو عودته من الخلفية. لا تُنشئ سجلاً جديداً ولا تغيّر أي
 * بيانات إلا بعد ضغط «جماعة» أو «مفرد».
 */
export function PrayerReminderWatcher() {
  const prayerLogs = useAppStore((s) => s.prayerLogs);
  const setPrayerStatus = useAppStore((s) => s.setPrayerStatus);
  const bankReviewing = usePending((s) => s.reviewing);
  const snoozesRef = useRef<SnoozeMap>({});
  const [hydrated, setHydrated] = useState(() => useAppStore.persist.hasHydrated());
  const [candidate, setCandidate] = useState<PrayerReminderCandidate | null>(null);

  useEffect(() => {
    snoozesRef.current = readSnoozes();
  }, []);

  // Do not ask against Zustand's empty initial snapshot while IndexedDB (or
  // the first cloud merge) is still hydrating. Otherwise a recorded prayer
  // could flash as unanswered for one render on a fresh device.
  useEffect(() => {
    if (useAppStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    const done = () => setHydrated(true);
    const unsubscribe = useAppStore.persist.onFinishHydration(done);
    return unsubscribe;
  }, []);

  const refresh = useCallback(() => {
    const current = new Date();
    const date = today();
    const coords = getCachedCoords();
    const times = computePrayerTimes(parseDate(date), coords.lat, coords.lng);
    const log = getPrayerLog(prayerLogs, date);
    const due = duePrayerReminders(current, date, times, log);
    // نافذة مراجعة البنك أولويةٌ أعلى؛ لا نضع نافذتين فوق بعضهما. بعد إغلاقها
    // يعيد الأثر نفسه الحساب فتظهر مطالبة الصلاة إن بقيت مستحقة.
    const next = bankReviewing
      ? null
      : due.find((item) => (snoozesRef.current[item.token] ?? 0) <= current.getTime()) ?? null;
    // Keep the same candidate object while its sheet is open; this avoids
    // resetting the modal's focus every minute.
    setCandidate((previous) => previous?.token === next?.token ? previous : next);
  }, [bankReviewing, prayerLogs]);

  useEffect(() => {
    if (!hydrated) return;
    refresh();
    const interval = window.setInterval(refresh, 30_000);
    const onWake = () => refresh();
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [hydrated, refresh]);

  function answer(status: Extract<PrayerStatus, "جماعة" | "منفردة">) {
    if (!candidate) return;
    setPrayerStatus(candidate.date, candidate.prayer, status);
    const next = { ...snoozesRef.current };
    delete next[candidate.token];
    snoozesRef.current = next;
    writeSnoozes(next);
    setCandidate(null);
  }

  function later() {
    if (!candidate) return;
    const next = { ...snoozesRef.current, [candidate.token]: Date.now() + SNOOZE_MS };
    snoozesRef.current = next;
    writeSnoozes(next);
    setCandidate(null);
  }

  const title = candidate ? `تسجيل ${candidate.prayer}` : "تسجيل الصلاة";

  return (
    <Modal open={!!candidate} onClose={later} title={title}>
      {candidate && (
        <div className="space-y-4 text-center">
          <div className="space-y-1.5">
            <p className="text-base font-bold text-gray-900">هل صلّيت {candidate.prayer}؟</p>
            <p className="text-xs text-gray-500">مرّت ٣٠ دقيقة على الأذان — {prayerLabel(candidate)}.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <MdrButton kind="ink" onClick={() => answer("جماعة")} style={{ width: "100%" }}>
              جماعة
            </MdrButton>
            <MdrButton kind="ghost" onClick={() => answer("منفردة")} style={{ width: "100%" }}>
              مفرد
            </MdrButton>
          </div>
          <button
            type="button"
            onClick={later}
            className="text-xs font-semibold text-gray-400 underline underline-offset-4 press"
          >
            ذكّرني لاحقًا
          </button>
        </div>
      )}
    </Modal>
  );
}
