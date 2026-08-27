import type { AppData } from "./types";

/**
 * A backup is user data, not an untrusted merge patch. Validate the shape before
 * it reaches `normalizeBackup`/`mergeAppData`; silently coercing a malformed
 * collection to an empty array could make a replace restore erase data.
 *
 * Legacy files are intentionally supported: optional AppData fields may be
 * absent, but every field that is present must have the kind of value the app
 * can safely round-trip.
 */
export const MAX_BACKUP_BYTES = 256 * 1024 * 1024;

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): value is UnknownRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function finiteNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function optionalFiniteNumber(value: unknown): boolean {
  return value === undefined || finiteNumber(value);
}

function idCollection(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => record(item) && typeof item.id === "string" && item.id.length > 0);
}

function validTransactions(value: unknown): boolean {
  if (!idCollection(value)) return false;
  return (value as UnknownRecord[]).every((transaction) =>
    typeof transaction.date === "string"
    && finiteNumber(transaction.amount)
    && typeof transaction.category === "string"
    && typeof transaction.note === "string"
    && optionalFiniteNumber(transaction.updatedAt)
  );
}

function objectCollection(value: unknown): boolean {
  return Array.isArray(value) && value.every(record);
}

function stringCollection(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function numberMap(value: unknown): boolean {
  return record(value) && Object.values(value).every(finiteNumber);
}

function stringMap(value: unknown): boolean {
  return record(value) && Object.values(value).every((item) => typeof item === "string");
}

function validJournalEntries(value: unknown): boolean {
  if (!idCollection(value)) return false;
  return (value as UnknownRecord[]).every((entry) => {
    if (typeof entry.date !== "string" || typeof entry.content !== "string") return false;
    if (entry.tags !== undefined && !stringCollection(entry.tags)) return false;
    if (entry.photos !== undefined && !stringCollection(entry.photos)) return false;
    if (entry.audios !== undefined && !stringCollection(entry.audios)) return false;
    if (!optionalString(entry.photo) || !optionalString(entry.audio)) return false;
    if (entry.photoRefs !== undefined && !stringCollection(entry.photoRefs)) return false;
    if (entry.audioRefs !== undefined && !stringCollection(entry.audioRefs)) return false;
    if (entry.attachmentRefs !== undefined && !Array.isArray(entry.attachmentRefs)) return false;
    if (Array.isArray(entry.attachmentRefs)) {
      for (const attachment of entry.attachmentRefs) {
        if (!record(attachment) || (attachment.kind !== "pdf" && attachment.kind !== "file")) return false;
        if (typeof attachment.status !== "string") return false;
        if (!optionalString(attachment.filename) || !optionalString(attachment.hash) || !optionalString(attachment.localData)) return false;
        if (!optionalString(attachment.previewHash) || !optionalString(attachment.contentType)) return false;
        if (!optionalFiniteNumber(attachment.size)) return false;
      }
    }
    if (entry.location !== undefined) {
      if (!record(entry.location) || !finiteNumber(entry.location.lat) || !finiteNumber(entry.location.lng)) return false;
      if (!optionalString(entry.location.place)) return false;
    }
    return optionalFiniteNumber(entry.updatedAt);
  });
}

function validPrayerLogs(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => {
    if (!record(item) || typeof item.date !== "string" || !record(item.prayers)) return false;
    if (item.prayerUpdatedAt !== undefined && !numberMap(item.prayerUpdatedAt)) return false;
    if (!optionalFiniteNumber(item.sunan) || !optionalFiniteNumber(item.sunanUpdatedAt)) return false;
    if (item.qiyam !== undefined && (!record(item.qiyam) || !finiteNumber(item.qiyam.rakaat) || typeof item.qiyam.witr !== "boolean")) return false;
    return optionalFiniteNumber(item.qiyamUpdatedAt);
  });
}

function validHifz(value: unknown): boolean {
  if (!record(value)) return false;
  if (value.plan !== undefined && value.plan !== null && !record(value.plan)) return false;
  if (value.sessions !== undefined && !idCollection(value.sessions)) return false;
  if (value.reviews !== undefined && !idCollection(value.reviews)) return false;
  if (value.mistakes !== undefined && !idCollection(value.mistakes)) return false;
  if (value.frontierId !== undefined && !finiteNumber(value.frontierId)) return false;
  if (value.deletedRecords !== undefined && !numberMap(value.deletedRecords)) return false;
  return optionalString(value.planId) && optionalString(value.lastTestDate)
    && optionalFiniteNumber(value.planUpdatedAt) && optionalFiniteNumber(value.frontierUpdatedAt);
}

function validMeta(value: unknown): boolean {
  if (value === undefined) return true;
  if (!record(value)) return false;
  if (value.app !== undefined && value.app !== "madar") return false;
  if (value.backupVersion !== undefined && !finiteNumber(value.backupVersion)) return false;
  if (value.schemaVersion !== undefined && !finiteNumber(value.schemaVersion)) return false;
  if (value.createdAt !== undefined && typeof value.createdAt !== "string") return false;
  if (value.checksum !== undefined && typeof value.checksum !== "string") return false;
  return value.counts === undefined || (record(value.counts) && Object.values(value.counts).every((item) => Number.isSafeInteger(item) && (item as number) >= 0));
}

/** Returns `true` only for a payload safe to pass to the restore preview. */
export function isValidBackupPayload(value: unknown): value is UnknownRecord & Partial<AppData> {
  if (!record(value) || !validTransactions(value.transactions)) return false;
  if (!validMeta(value.__meta)) return false;

  const idFields = [
    "books", "readingLogs", "knowledgeSources", "benefits", "shelfItems", "habits",
    "recurring", "installmentPlans", "assets", "categories", "reserves",
    "quranReflections", "futureLetters", "countdownEvents",
  ];
  for (const field of idFields) {
    if (value[field] !== undefined && !idCollection(value[field])) return false;
  }
  if (value.journalEntries !== undefined && !validJournalEntries(value.journalEntries)) return false;
  if (value.budgets !== undefined && !objectCollection(value.budgets)) return false;
  if (value.prayerLogs !== undefined && !validPrayerLogs(value.prayerLogs)) return false;
  if (value.quranWird !== undefined && !stringCollection(value.quranWird)) return false;
  if (value.quranHifz !== undefined && !validHifz(value.quranHifz)) return false;
  if (value.quranKhatma !== undefined && !record(value.quranKhatma)) return false;
  if (value.frozenHabits !== undefined && !stringCollection(value.frozenHabits)) return false;
  if (value.deleted !== undefined && !numberMap(value.deleted)) return false;
  if (value.deletedMedia !== undefined && !numberMap(value.deletedMedia)) return false;
  if (value.fieldUpdatedAt !== undefined && !numberMap(value.fieldUpdatedAt)) return false;
  if (value.merchantRules !== undefined && !stringMap(value.merchantRules)) return false;

  const qadaBacklog = value.qadaBacklog;
  if (qadaBacklog !== undefined && (typeof qadaBacklog !== "number" || !Number.isFinite(qadaBacklog) || qadaBacklog < 0)) return false;
  if (value.dailyBudget !== undefined && value.dailyBudget !== null && !record(value.dailyBudget)) return false;
  if (record(value.dailyBudget)) {
    if (!finiteNumber(value.dailyBudget.amount) || typeof value.dailyBudget.startDate !== "string") return false;
    if (!optionalFiniteNumber(value.dailyBudget.monthlyIncome) || !optionalFiniteNumber(value.dailyBudget.incomePct) || !optionalFiniteNumber(value.dailyBudget.carryAdjust)) return false;
  }
  if (value.monthlyIncome !== undefined && value.monthlyIncome !== null && !finiteNumber(value.monthlyIncome)) return false;
  if (value.salaryDay !== undefined && !finiteNumber(value.salaryDay)) return false;
  if (value.budgetWindow !== undefined && value.budgetWindow !== "salary" && value.budgetWindow !== "month") return false;
  if (value.lastSalaryConfirm !== undefined && value.lastSalaryConfirm !== null && typeof value.lastSalaryConfirm !== "string") return false;
  if (value.readingGoal !== undefined && value.readingGoal !== null && !finiteNumber(value.readingGoal)) return false;
  if (value.lastUpdated !== undefined && typeof value.lastUpdated !== "string") return false;
  return true;
}
