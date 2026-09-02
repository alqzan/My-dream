"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import type { PrayerName, PrayerStatus } from "@/lib/types";
import { computePrayerTimes, getCachedCoords, getPrayerLog, parseDate, today, formatClock } from "@/lib/utils";
import {
  duePrayerReminders,
  latestRecordedPrayerAt,
  pickSmartPrayerReminder,
  type PrayerReminderCandidate,
} from "@/lib/prayerReminder";
import { Modal } from "@/components/ui/Modal";
import { MdrButton } from "@/components/madar/primitives";
import { arClock } from "@/lib/madar/format";
import { usePending } from "@/lib/pending";
import { Clock3 } from "lucide-react";
import { MosqueIcon } from "@/components/icons/MosqueIcon";

const STORAGE_KEY = "madar-prayer-reminders-v1";
const SNOOZE_MS = 90 * 60 * 1000;
const DAY_QUIET_SUFFIX = ":day-quiet";

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

function endOfLocalDay(date: string): number {
  const next = parseDate(date);
  next.setDate(next.getDate() + 1);
  next.setHours(0, 0, 0, 0);
  return next.getTime();
}

function dayQuietKey(date: string): string {
  return `${date}${DAY_QUIET_SUFFIX}`;
}

function prayerLabel(prayer: PrayerReminderCandidate): string {
  return `${prayer.prayer} (${arClock(prayer.adhanAt, formatClock)})`;
}

/**
 * مطالبةٌ عامةٌ خفيفة: بعد نصف ساعة من كل أذانٍ غير مسجّل، تسأل عن طريقة
 * الصلاة. تعمل حين تكون الصفحة مفتوحة، وتلحق بآخر تذكير حديث عند فتح التطبيق
 * أو عودته من الخلفية، مع تأجيلٍ متدرّج حتى لا تضيع فرصة التسجيل. لا تُنشئ
 * سجلاً جديداً ولا تغيّر أي بيانات إلا بعد ضغط «جماعة» أو «مفرد».
 */
export function PrayerReminderWatcher() {
  const prayerLogs = useAppStore((s) => s.prayerLogs);
  const setPrayerStatus = useAppStore((s) => s.setPrayerStatus);
  const bankReviewing = usePending((s) => s.reviewing);
  const snoozesRef = useRef<SnoozeMap>({});
  // The store update is synchronous, but React may render the old selector
  // snapshot once more while a reminder is being answered. Keep the answer
  // local too, so that race cannot reopen the same sheet in this session.
  const answeredTokensRef = useRef<Set<string>>(new Set());
  // After answering or dismissing the latest prayer, do not walk backwards
  // through older due prayers in the same session. A newer prayer can still
  // advance the reminder naturally.
  const handledAtRef = useRef<Map<string, number>>(new Map());
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
    if (document.visibilityState !== "visible") return;
    const current = new Date();
    const date = today();
    const coords = getCachedCoords();
    const times = computePrayerTimes(parseDate(date), coords.lat, coords.lng);
    const log = getPrayerLog(prayerLogs, date);
    const due = duePrayerReminders(current, date, times, log);
    const smartCandidate = pickSmartPrayerReminder(due, current);
    const handledThrough = Math.max(
      latestRecordedPrayerAt(times, log),
      ...handledAtRef.current.values(),
    );
    const quietUntil = snoozesRef.current[dayQuietKey(date)] ?? 0;
    // نافذة مراجعة البنك أولويةٌ أعلى؛ لا نضع نافذتين فوق بعضهما. بعد إغلاقها
    // يعيد الأثر نفسه الحساب فتظهر مطالبة الصلاة إن بقيت مستحقة.
    // لا نرجع إلى صلاةٍ أقدم إذا كان آخر تذكير حديثاً لكنه مؤجّل؛ هذا يمنع
    // النافذة من الالتفاف على اختيار المستخدم وعرض سلسلةٍ من المطالبات القديمة.
    const next = bankReviewing || quietUntil > current.getTime() || !smartCandidate
      ? null
      : smartCandidate.adhanAt.getTime() <= handledThrough ||
          answeredTokensRef.current.has(smartCandidate.token) ||
          (snoozesRef.current[smartCandidate.token] ?? 0) > current.getTime()
        ? null
        : smartCandidate;
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

  // A prayer can also be logged from the main prayer screen while this sheet
  // is open. Close immediately when its store value becomes recorded; waiting
  // for the 30-second timer made the prompt feel as if it ignored the user.
  useEffect(() => {
    if (!candidate) return;
    const status = getPrayerLog(prayerLogs, candidate.date)?.prayers[candidate.prayer];
    if (status !== undefined && status !== "لم") {
      answeredTokensRef.current.add(candidate.token);
      handledAtRef.current.set(candidate.token, candidate.adhanAt.getTime());
      setCandidate(null);
    }
  }, [candidate, prayerLogs]);

  // If the owner later clears a prayer back to «لم» from the prayer screen,
  // release the session guard so a genuinely unanswered prayer can be asked
  // about again. A recorded answer remains guarded.
  useEffect(() => {
    for (const token of answeredTokensRef.current) {
      const date = token.slice(0, 10);
      const prayer = token.slice(11) as PrayerName;
      const status = getPrayerLog(prayerLogs, date)?.prayers[prayer];
      if (status === undefined || status === "لم") {
        answeredTokensRef.current.delete(token);
        handledAtRef.current.delete(token);
      }
    }
  }, [prayerLogs]);

  function answer(status: Extract<PrayerStatus, "جماعة" | "منفردة">) {
    if (!candidate) return;
    answeredTokensRef.current.add(candidate.token);
    handledAtRef.current.set(candidate.token, candidate.adhanAt.getTime());
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

  function quietForToday() {
    if (!candidate) return;
    handledAtRef.current.set(candidate.token, candidate.adhanAt.getTime());
    const next = {
      ...snoozesRef.current,
      [candidate.token]: endOfLocalDay(candidate.date),
      [dayQuietKey(candidate.date)]: endOfLocalDay(candidate.date),
    };
    snoozesRef.current = next;
    writeSnoozes(next);
    setCandidate(null);
  }

  const title = candidate ? `تذكير ${candidate.prayer}` : "تذكير الصلاة";

  return (
    <Modal open={!!candidate} onClose={later} title={title} className="mdr-prayer-reminder-modal">
      {candidate && (
        <div className="mdr-prayer-reminder">
          <div className="mdr-prayer-reminder-banner">
            <span className="mdr-prayer-reminder-icon" aria-hidden="true"><MosqueIcon size={20} /></span>
            <span className="mdr-prayer-reminder-banner-copy">
              <strong>تذكير الصلاة</strong>
              <small><Clock3 size={12} aria-hidden="true" /> مرّت ٣٠ دقيقة على الأذان</small>
            </span>
          </div>

          <div className="mdr-prayer-reminder-question">
            <strong>هل صلّيت {candidate.prayer}؟</strong>
            <span>{prayerLabel(candidate)} — سجّلها عشان ما تتكرر المطالبة.</span>
          </div>

          <div className="mdr-prayer-reminder-actions">
            <MdrButton kind="ink" onClick={() => answer("جماعة")} style={{ width: "100%" }}>
              صليتها جماعة
            </MdrButton>
            <MdrButton kind="ghost" onClick={() => answer("منفردة")} style={{ width: "100%" }}>
              صليتها مفرد
            </MdrButton>
          </div>

          <button
            type="button"
            onClick={later}
            className="mdr-prayer-reminder-later press"
          >
            ذكّرني بعد ساعة ونصف
          </button>
          <button
            type="button"
            onClick={quietForToday}
            className="mdr-prayer-reminder-dismiss press"
          >
            لا تذكرني اليوم
          </button>
        </div>
      )}
    </Modal>
  );
}
