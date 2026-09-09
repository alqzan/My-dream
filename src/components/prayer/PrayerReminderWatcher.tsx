"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import type { KhushuLevel, PrayerName, PrayerStatus } from "@/lib/types";
import { KHUSHU_LEVELS, KHUSHU_META } from "@/lib/types";
import { arabicCount, computePrayerTimes, getCachedCoords, getPrayerLog, parseDate, today, formatClock } from "@/lib/utils";
import {
  duePrayerRemindersRange,
  lookbackDates,
  groupByDate,
  relativeDayLabel,
  pickPrayerReminderGroup,
  type PrayerReminderCandidate,
} from "@/lib/prayerReminder";
import { Modal } from "@/components/ui/Modal";
import { PrayerAnswer } from "@/components/madar/prayer/PrayerAnswer";
import { arClock } from "@/lib/madar/format";
import { usePending } from "@/lib/pending";
import { Check, Clock3 } from "lucide-react";
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

/** «يومٍ واحد · يومين · ٣ أيام» — مدى المطالبة في ترويستها. */
const daysCount = (n: number): string =>
  arabicCount(n, { one: "يومٍ واحد", two: "يومين", few: "أيام", many: "يومًا" });

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
 *
 * **وسؤالُ الخشوع هنا لا في صفحة الصلاة وحدها**: هذه النافذة هي المكان الذي
 * يُسجَّل منه أكثرُ الصلوات فعلاً — تأتي إلى المالك حيثما كان في التطبيق، ولا
 * يقصد صفحةَ الصلاة إلا ليرى إحصاءه. فسؤالٌ يعيش هناك وحده يُطرح على ما نُدر
 * من التسجيل، ويبقى أكثرُه بلا جواب. يظهر السؤال بعد اختيار الحال مباشرةً في
 * النافذة نفسِها، ويُتخطّى بضغطةٍ واحدة («أمرُّ») فلا يُثقل التسجيل الذي جاء
 * من أجله.
 */
export function PrayerReminderWatcher() {
  const prayerLogs = useAppStore((s) => s.prayerLogs);
  const setPrayerStatus = useAppStore((s) => s.setPrayerStatus);
  const setKhushu = useAppStore((s) => s.setKhushu);
  const bankReviewing = usePending((s) => s.reviewing);
  const snoozesRef = useRef<SnoozeMap>({});
  // The store update is synchronous, but React may render the old selector
  // snapshot once more while a reminder is being answered. Keep the answer
  // local too, so that race cannot reopen the same row in this session.
  const answeredTokensRef = useRef<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(() => useAppStore.persist.hasHydrated());
  const [candidates, setCandidates] = useState<PrayerReminderCandidate[]>([]);
  // ما أُجيب في هذه الجلسة: الحالُ المختارة، وهل انتهى سؤالُ القلب عنها.
  // الصفُّ المُجاب يبقى معروضاً بعلامته لا يختفي — فيرى المالك تقدّمه ويصحّح
  // ما أخطأ فيه قبل أن يُغلق النافذة.
  const [answers, setAnswers] = useState<Record<string, { status: PrayerStatus; heartDone: boolean }>>({});
  // أثرُ التنظيف أدناه يعتمد على `prayerLogs` وحدها (بقصد)، فلو قرأ `answers`
  // مباشرةً لالتقط لقطةً قديمة. المرآةُ في ref تُقرأ دائماً حاضرة.
  const answersRef = useRef<Record<string, { status: PrayerStatus; heartDone: boolean }>>({});
  answersRef.current = answers;
  // الصفُّ المفتوح — واحدٌ لا أكثر: قائمةٌ فيها صلواتُ أيامٍ كلُّها مفتوحةٌ
  // معاً جدارٌ لا يُقرأ، والمفتوحُ الواحد يقود المالكَ صلاةً صلاة.
  const [openToken, setOpenToken] = useState<string | null>(null);
  // مرآةُ الصفوف المعروضة — يقرأها `refresh` ليستبقي ما ينتظر سؤالَ القلب
  // دون أن يجعل نفسَه تابعاً لها (فتُعاد دورةُ الحساب بلا داعٍ).
  const candidatesRef = useRef<PrayerReminderCandidate[]>([]);

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
    // **تمتدّ المطالبة لما مضى**: من غاب عن التطبيق أياماً كانت صلواتُ تلك
    // الأيام تسقط بلا تسجيلٍ إلى الأبد — لا تُسأل عنها ولا تظهر إلا لمن فتح
    // تقويم الشهر وعدّلها يوماً يوماً. الآن تُجمع كلُّها في نافذةٍ واحدة
    // مرتّبةً بيومها.
    const due = duePrayerRemindersRange(
      current,
      lookbackDates(date),
      (d) => computePrayerTimes(parseDate(d), coords.lat, coords.lng),
      (d) => getPrayerLog(prayerLogs, d)
    );
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
    // صفٌّ سُجّلت حالُه للتوّ وينتظر سؤالَ القلب لم يعد «مستحقّاً» في حساب
    // `duePrayerReminders`، فلولا استبقاؤه هنا لاختفى تحت الإصبع قبل أن يُطرح
    // السؤال أصلاً — والحساب يُعاد مع كلّ تغيّرٍ في السجلّ، أي فور التسجيل.
    const held = candidatesRef.current.filter((c) => c.token in answersRef.current);
    const merged = [...held, ...next.filter((c) => !(c.token in answersRef.current))]
      .sort((a, b) => a.adhanAt.getTime() - b.adhanAt.getTime());
    // Keep the same array while the sheet is open and nothing changed; this
    // avoids resetting the modal's focus every minute.
    setCandidates((previous) =>
      previous.length === merged.length &&
      previous.every((item, index) => item.token === merged[index].token)
        ? previous
        : merged
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
        // صفٌّ سُجّل حالُه وينتظر سؤالَ القلب يبقى: هذا التنظيف يُسقط ما سُجّل
        // من مكانٍ آخر، ولو أسقطه هنا لاختفى الصفُّ قبل أن يُطرح السؤال أصلاً.
        if (candidate.token in answersRef.current) return true;
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

  /** الصفُّ التالي الذي لم يُجَب بعد — إليه ينتقل الفتحُ تلقائياً. */
  function nextOpen(after: Record<string, { status: PrayerStatus; heartDone: boolean }>): string | null {
    const next = candidatesRef.current.find((c) => !after[c.token]?.heartDone);
    return next ? next.token : null;
  }

  function answer(
    candidate: PrayerReminderCandidate,
    status: Extract<PrayerStatus, "جماعة" | "منفردة" | "قضاء" | "فائتة">
  ) {
    answeredTokensRef.current.add(candidate.token);
    setPrayerStatus(candidate.date, candidate.prayer, status);
    const snoozed = { ...snoozesRef.current };
    delete snoozed[candidate.token];
    snoozesRef.current = snoozed;
    writeSnoozes(snoozed);
    // «فاتتني» لا قلبَ يُسأل عنه، فينتهي أمرُ الصفّ ويُفتح الذي بعده.
    const heartDone = status === "فائتة";
    const after = { ...answersRef.current, [candidate.token]: { status, heartDone } };
    setAnswers(after);
    if (heartDone) setOpenToken(nextOpen(after));
    // وما عداها يبقى مفتوحاً ليُطرح سؤالُ القلب في مكانه.
  }

  /** جوابُ القلب — أو تخطّيه بـ`undefined`. في الحالين يُفتح الصفُّ التالي. */
  function answerKhushu(candidate: PrayerReminderCandidate, level: KhushuLevel | undefined) {
    if (level !== undefined) setKhushu(candidate.date, candidate.prayer, level);
    const prev = answersRef.current[candidate.token];
    const after = {
      ...answersRef.current,
      [candidate.token]: { status: prev?.status ?? "منفردة", heartDone: true },
    };
    setAnswers(after);
    setOpenToken(nextOpen(after));
  }

  function later() {
    if (!candidates.length) return;
    const until = Date.now() + SNOOZE_MS;
    const next = { ...snoozesRef.current };
    for (const candidate of candidates) next[candidate.token] = until;
    snoozesRef.current = next;
    writeSnoozes(next);
    setCandidates([]);
    setAnswers({});
    setOpenToken(null);
  }

  function quietForToday() {
    if (!candidates.length) return;
    const next = { ...snoozesRef.current };
    // مفتاحُ الصمت مفتاحُ **اليوم الجاري** دائماً: صفوفُ الأيام الماضية تنتهي
    // مهلتُها في ماضيها، فلو اكتفينا بمفاتيحها لعادت النافذةُ بعد ثوانٍ.
    const todayStr = today();
    next[dayQuietKey(todayStr)] = endOfLocalDay(todayStr);
    for (const candidate of candidates) {
      next[candidate.token] = endOfLocalDay(todayStr);
      next[dayQuietKey(candidate.date)] = endOfLocalDay(todayStr);
    }
    snoozesRef.current = next;
    writeSnoozes(next);
    setCandidates([]);
    setAnswers({});
    setOpenToken(null);
  }

  candidatesRef.current = candidates;

  const single = candidates.length === 1 ? candidates[0] : null;
  const remaining = candidates.filter((c) => !answers[c.token]?.heartDone).length;
  const todayStr = today();
  // المجموعاتُ تُرسم بترويسةِ يومها **فقط حين تمتدّ المطالبة لما مضى**؛ ولو
  // كانت كلُّها اليومَ لكانت الترويسةُ سطراً يقول ما تعرفه أصلاً.
  const groups = useMemo(() => groupByDate(candidates), [candidates]);
  const spansPast = groups.some((g) => g.date !== todayStr);
  const whenOf = (date: string) => (date === todayStr ? undefined : relativeDayLabel(date, todayStr));
  const title = single ? `تذكير ${single.prayer}` : candidates.length > 1 ? "تذكير الصلوات" : "تذكير الصلاة";

  // انتهى كلُّ ما في النافذة → أغلِقها بنفسها. لا يُترك المالك أمام قائمةٍ
  // كلُّها علاماتُ صحٍّ ينتظر منه ضغطةَ إغلاق.
  useEffect(() => {
    if (candidates.length > 0 && remaining === 0) {
      const t = window.setTimeout(() => { setCandidates([]); setAnswers({}); setOpenToken(null); }, 420);
      return () => window.clearTimeout(t);
    }
  }, [candidates.length, remaining]);

  // أوّلُ صفٍّ غير مُجابٍ يُفتح تلقائياً — فأوّلُ ضغطةٍ جوابٌ لا فتح.
  useEffect(() => {
    if (!candidates.length) return;
    if (openToken && candidates.some((c) => c.token === openToken)) return;
    const first = candidates.find((c) => !answers[c.token]?.heartDone);
    setOpenToken(first ? first.token : null);
  }, [candidates, openToken, answers]);

  return (
    <Modal open={candidates.length > 0} onClose={later} title={title} className="mdr-prayer-reminder-modal">
      {candidates.length > 0 && (
        <div className="mdr mdr-prayer-reminder">
          <div className="mdr-prayer-reminder-banner">
            <span className="mdr-prayer-reminder-icon" aria-hidden="true"><MosqueIcon size={20} /></span>
            <span className="mdr-prayer-reminder-banner-copy">
              <strong>{single ? "تذكير الصلاة" : "صلواتٌ ما سجّلتها"}</strong>
              <small>
                <Clock3 size={12} aria-hidden="true" />
                {/* العدُّ يُنقص ما أُجيب للتوّ: ترويسةٌ تقول «٣ تنتظر التسجيل»
                    وقد سجّلتَ اثنتين منها أمام عينك تكذب على قارئها. */}
                {single
                  ? spansPast
                    ? `${relativeDayLabel(single.date, todayStr)} · ${clockOf(single)}`
                    : "مرّت ٣٠ دقيقة على الأذان"
                  : spansPast
                    ? `${prayersCount(remaining)} على مدى ${daysCount(groups.length)}`
                    : `${prayersCount(remaining)} تنتظر التسجيل`}
              </small>
            </span>
          </div>

          {/* **السؤالان من مصدرٍ واحد** (`PrayerAnswer`): الصلاةُ الواحدة تأخذه
              كاملاً، والقائمةُ تأخذه مضغوطاً داخل صفٍّ مفتوح — نفسُ الصياغة
              ونفسُ الحالات الأربع ونفسُ الألوان في الموضعين. */}
          {single ? (
            <PrayerAnswer
              prayer={single.prayer}
              when={whenOf(single.date)}
              timeLabel={clockOf(single)}
              status={answers[single.token]?.status}
              khushu={undefined}
              onStatus={(v) => answer(single, v as "جماعة" | "منفردة" | "قضاء" | "فائتة")}
              onKhushu={(l) => answerKhushu(single, l)}
            />
          ) : (
            <div className="mdr-prayer-reminder-groups">
              {groups.map((group) => (
                <section key={group.date}>
                  {spansPast && (
                    <p className="mdr-prayer-reminder-daybar">
                      <span>{relativeDayLabel(group.date, todayStr)}</span>
                      <span className="mdr-prayer-reminder-daybar-rule" aria-hidden="true" />
                      <small>{prayersCount(group.items.length)}</small>
                    </p>
                  )}
                  <ul className="mdr-prayer-reminder-list">
                    {group.items.map((candidate) => {
                      const done = answers[candidate.token]?.heartDone;
                      const open = openToken === candidate.token;
                      return (
                        <li
                          key={candidate.token}
                          className={`mdr-prayer-reminder-row${open ? " is-open" : ""}${done ? " is-done" : ""}`}
                        >
                          <button
                            type="button"
                            className="mdr-prayer-reminder-head press"
                            aria-expanded={open}
                            onClick={() => setOpenToken(open ? null : candidate.token)}
                          >
                            <span className="mdr-prayer-reminder-row-name">
                              <strong>{candidate.prayer}</strong>
                              <small>{clockOf(candidate)}</small>
                            </span>
                            {/* الصفُّ المُجاب يبقى بعلامته: تقدُّمٌ يُرى، وخطأٌ
                                يُصحَّح بضغطةٍ تعيد فتحه. */}
                            {answers[candidate.token] && (
                              <span className="mdr-prayer-reminder-tag">
                                {done && <Check size={12} aria-hidden="true" />}
                                {answers[candidate.token].status}
                              </span>
                            )}
                          </button>
                          {open && (
                            <PrayerAnswer
                              prayer={candidate.prayer}
                              when={whenOf(candidate.date)}
                              status={answers[candidate.token]?.status}
                              khushu={undefined}
                              dense
                              onStatus={(v) => answer(candidate, v as "جماعة" | "منفردة" | "قضاء" | "فائتة")}
                              onKhushu={(l) => answerKhushu(candidate, l)}
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
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
