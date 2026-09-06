"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import type { PrayerName, PrayerStatus } from "@/lib/types";
import { arabicCount, computePrayerTimes, getCachedCoords, getPrayerLog, parseDate, today, formatClock } from "@/lib/utils";
import {
  duePrayerReminders,
  pickPrayerReminderGroup,
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

/** «صلاة · صلاتان · ٣ صلوات · ١١ صلاة» — تمييزُ العدد في ترويسة المطالبة. */
const prayersCount = (n: number): string =>
  arabicCount(n, { one: "صلاةٌ واحدة", two: "صلاتان", few: "صلوات", many: "صلاة" });

function clockOf(candidate: PrayerReminderCandidate): string {
  return arClock(candidate.adhanAt, formatClock);
}

/**
 * مطالبةٌ عامةٌ خفيفة: بعد نصف ساعة من كل أذانٍ غير مسجّل، تسأل عن طريقة
 * الصلاة. تعمل حين تكون الصفحة مفتوحة، وتلحق بالتذكيرات المستحقّة عند فتح
 * التطبيق أو عودته من الخلفية.
 *
 * **نافذةٌ واحدة لكلّ الصلوات غير المسجّلة**: إن فتح المالك التطبيق وقد مرّت
 * عليه صلاتان أو ثلاث، رآها كلَّها في قائمةٍ واحدة وسجّل ما يشاء منها في مكانٍ
 * واحد — بدل مطالبةٍ بآخر صلاةٍ فقط تُسقِط ما قبلها من التسجيل. وإن كانت صلاةً
 * واحدة بقيت النافذة سؤالاً مباشراً بزرّين كما كانت.
 *
 * لا تُنشئ سجلاً جديداً ولا تغيّر أي بيانات إلا بعد ضغط «جماعة» أو «مفرد».
 */
export function PrayerReminderWatcher() {
  const prayerLogs = useAppStore((s) => s.prayerLogs);
  const setPrayerStatus = useAppStore((s) => s.setPrayerStatus);
  const bankReviewing = usePending((s) => s.reviewing);
  const snoozesRef = useRef<SnoozeMap>({});
  // The store update is synchronous, but React may render the old selector
  // snapshot once more while a reminder is being answered. Keep the answer
  // local too, so that race cannot reopen the same row in this session.
  const answeredTokensRef = useRef<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(() => useAppStore.persist.hasHydrated());
  const [candidates, setCandidates] = useState<PrayerReminderCandidate[]>([]);

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
    const quietUntil = snoozesRef.current[dayQuietKey(date)] ?? 0;
    // نافذة مراجعة البنك أولويةٌ أعلى؛ لا نضع نافذتين فوق بعضهما. بعد إغلاقها
    // يعيد الأثر نفسه الحساب فتظهر مطالبة الصلاة إن بقيت مستحقة.
    const next =
      bankReviewing || quietUntil > current.getTime()
        ? []
        : pickPrayerReminderGroup(due, current).filter(
            (candidate) =>
              !answeredTokensRef.current.has(candidate.token) &&
              (snoozesRef.current[candidate.token] ?? 0) <= current.getTime()
          );
    // Keep the same array while the sheet is open and nothing changed; this
    // avoids resetting the modal's focus every minute.
    setCandidates((previous) =>
      previous.length === next.length &&
      previous.every((item, index) => item.token === next[index].token)
        ? previous
        : next
    );
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
  // is open. Drop its row immediately when its store value becomes recorded;
  // waiting for the 30-second timer made the prompt feel as if it ignored the
  // user.
  useEffect(() => {
    setCandidates((previous) => {
      const next = previous.filter((candidate) => {
        const status = getPrayerLog(prayerLogs, candidate.date)?.prayers[candidate.prayer];
        return status === undefined || status === "لم";
      });
      return next.length === previous.length ? previous : next;
    });
  }, [prayerLogs]);

  // If the owner later clears a prayer back to «لم» from the prayer screen,
  // release the session guard so a genuinely unanswered prayer can be asked
  // about again. A recorded answer remains guarded.
  useEffect(() => {
    for (const token of answeredTokensRef.current) {
      const date = token.slice(0, 10);
      const prayer = token.slice(11) as PrayerName;
      const status = getPrayerLog(prayerLogs, date)?.prayers[prayer];
      if (status === undefined || status === "لم") answeredTokensRef.current.delete(token);
    }
  }, [prayerLogs]);

  function answer(candidate: PrayerReminderCandidate, status: Extract<PrayerStatus, "جماعة" | "منفردة">) {
    answeredTokensRef.current.add(candidate.token);
    setPrayerStatus(candidate.date, candidate.prayer, status);
    const next = { ...snoozesRef.current };
    delete next[candidate.token];
    snoozesRef.current = next;
    writeSnoozes(next);
    setCandidates((previous) => previous.filter((item) => item.token !== candidate.token));
  }

  function later() {
    if (!candidates.length) return;
    const until = Date.now() + SNOOZE_MS;
    const next = { ...snoozesRef.current };
    for (const candidate of candidates) next[candidate.token] = until;
    snoozesRef.current = next;
    writeSnoozes(next);
    setCandidates([]);
  }

  function quietForToday() {
    if (!candidates.length) return;
    const next = { ...snoozesRef.current };
    for (const candidate of candidates) {
      next[candidate.token] = endOfLocalDay(candidate.date);
      next[dayQuietKey(candidate.date)] = endOfLocalDay(candidate.date);
    }
    snoozesRef.current = next;
    writeSnoozes(next);
    setCandidates([]);
  }

  const single = candidates.length === 1 ? candidates[0] : null;
  const title = useMemo(() => {
    if (single) return `تذكير ${single.prayer}`;
    if (candidates.length > 1) return "تذكير الصلوات";
    return "تذكير الصلاة";
  }, [single, candidates.length]);

  return (
    <Modal open={candidates.length > 0} onClose={later} title={title} className="mdr-prayer-reminder-modal">
      {candidates.length > 0 && (
        <div className="mdr-prayer-reminder">
          <div className="mdr-prayer-reminder-banner">
            <span className="mdr-prayer-reminder-icon" aria-hidden="true"><MosqueIcon size={20} /></span>
            <span className="mdr-prayer-reminder-banner-copy">
              <strong>{single ? "تذكير الصلاة" : "صلواتٌ ما سجّلتها"}</strong>
              <small>
                <Clock3 size={12} aria-hidden="true" />
                {single ? "مرّت ٣٠ دقيقة على الأذان" : `${prayersCount(candidates.length)} تنتظر التسجيل`}
              </small>
            </span>
          </div>

          {single ? (
            <>
              <div className="mdr-prayer-reminder-question">
                <strong>هل صلّيت {single.prayer}؟</strong>
                <span>{single.prayer} ({clockOf(single)}) — سجّلها عشان ما تتكرر المطالبة.</span>
              </div>

              <div className="mdr-prayer-reminder-actions">
                <MdrButton kind="ink" onClick={() => answer(single, "جماعة")} style={{ width: "100%" }}>
                  صليتها جماعة
                </MdrButton>
                <MdrButton kind="ghost" onClick={() => answer(single, "منفردة")} style={{ width: "100%" }}>
                  صليتها مفرد
                </MdrButton>
              </div>
            </>
          ) : (
            <ul className="mdr-prayer-reminder-list">
              {candidates.map((candidate) => (
                <li key={candidate.token} className="mdr-prayer-reminder-row">
                  <span className="mdr-prayer-reminder-row-name">
                    <strong>{candidate.prayer}</strong>
                    <small>{clockOf(candidate)}</small>
                  </span>
                  <span className="mdr-prayer-reminder-row-actions">
                    <button
                      type="button"
                      className="mdr-prayer-reminder-chip is-jamaah press"
                      onClick={() => answer(candidate, "جماعة")}
                    >
                      جماعة
                    </button>
                    <button
                      type="button"
                      className="mdr-prayer-reminder-chip press"
                      onClick={() => answer(candidate, "منفردة")}
                    >
                      مفرد
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

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
