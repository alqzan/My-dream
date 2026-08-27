import type {
  AppData,
  Asset,
  Benefit,
  Book,
  CountdownEvent,
  FinanceCategoryDef,
  FutureLetter,
  Habit,
  InstallmentPlan,
  JournalEntry,
  KnowledgeSource,
  QuranReflection,
  ReadingLog,
  RecurringTransaction,
  ReserveFund,
  ShelfItem,
  Transaction,
} from "./types";

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

function hasId(value: unknown): value is UnknownRecord & { id: string } {
  return record(value) && typeof value.id === "string" && value.id.length > 0;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function optionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === "boolean";
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function optionalFiniteNumber(value: unknown): boolean {
  return value === undefined || finiteNumber(value);
}

function stringCollection(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function collectionOf<T>(
  value: unknown,
  validator: (item: unknown) => boolean,
): value is T[] {
  return Array.isArray(value) && value.every(validator);
}

function numberMap(value: unknown): boolean {
  return record(value) && Object.values(value).every(finiteNumber);
}

function stringMap(value: unknown): boolean {
  return record(value) && Object.values(value).every((item) => typeof item === "string");
}

const RECURRING_UNITS = new Set(["أسبوعي", "شهري"]);
const GENERATION_MODES = new Set(["auto", "reminder"]);
const INSTALLMENT_STATUSES = new Set(["active", "settled", "cancelled"]);
const INSTALLMENT_ROLES = new Set(["principal", "down", "installment", "final", "settlement"]);
const SOURCE_KINDS = new Set(["كتاب", "مقال", "درس", "تجربة"]);
const HIFZ_UNITS = new Set(["ayah", "quarter", "half", "page"]);
const HIFZ_INTENSITIES = new Set(["light", "balanced", "intense"]);
const PRAYER_NAMES = new Set(["الفجر", "الظهر", "العصر", "المغرب", "العشاء"]);
const PRAYER_STATUSES = new Set(["لم", "منفردة", "جماعة", "فائتة", "قضاء"]);

/** Runtime guard shared by backup restore and Firestore transaction shards. */
export function isValidTransaction(value: unknown): value is Transaction {
  if (!hasId(value)) return false;
  if (
    !nonEmptyString(value.date)
    || !finiteNumber(value.amount)
    || typeof value.category !== "string"
    || typeof value.note !== "string"
  ) return false;
  if (!optionalString(value.linkedJournalId)) return false;
  if (!optionalString(value.planId)) return false;
  if (!optionalFiniteNumber(value.planLinkedAt)) return false;
  if (!optionalFiniteNumber(value.planInstallmentNo)) return false;
  if (value.planRole !== undefined && !INSTALLMENT_ROLES.has(String(value.planRole))) return false;
  if (!optionalBoolean(value.deferred) || !optionalBoolean(value.offBudget)) return false;
  if (value.reserveSplits !== undefined && (
    !Array.isArray(value.reserveSplits)
    || !value.reserveSplits.every((split) => (
      record(split)
      && nonEmptyString(split.fundId)
      && finiteNumber(split.pct)
      && split.pct >= 0
      && split.pct <= 100
    ))
  )) return false;
  return optionalFiniteNumber(value.updatedAt);
}

function validVideoRef(value: unknown): boolean {
  return record(value)
    && optionalString(value.type)
    && optionalFiniteNumber(value.duration)
    && optionalString(value.posterHash)
    && optionalString(value.sourceMediaID);
}

function validAttachment(value: unknown): boolean {
  return record(value)
    && (value.kind === "pdf" || value.kind === "file")
    && typeof value.status === "string"
    && optionalString(value.filename)
    && optionalString(value.hash)
    && optionalString(value.localData)
    && optionalString(value.previewHash)
    && optionalString(value.contentType)
    && optionalFiniteNumber(value.size)
    && optionalString(value.sourceMediaID);
}

function validAudioMetadataRef(value: unknown): boolean {
  return record(value)
    && typeof value.status === "string"
    && optionalString(value.type)
    && optionalFiniteNumber(value.duration)
    && optionalString(value.filename)
    && optionalString(value.sourceMediaID);
}

function validPhotoEdit(value: unknown): boolean {
  if (!record(value)) return false;
  if (value.rotation !== undefined && ![0, 90, 180, 270].includes(value.rotation as number)) return false;
  return optionalFiniteNumber(value.scale)
    && optionalFiniteNumber(value.offsetX)
    && optionalFiniteNumber(value.offsetY)
    && optionalBoolean(value.flipX)
    && optionalBoolean(value.flipY);
}

function validMergedSource(value: unknown): boolean {
  return record(value)
    && nonEmptyString(value.id)
    && optionalString(value.time)
    && optionalString(value.title)
    && finiteNumber(value.chars)
    && value.chars >= 0
    && finiteNumber(value.photos)
    && value.photos >= 0
    && finiteNumber(value.audios)
    && value.audios >= 0
    && optionalString(value.dayOneUUID)
    && finiteNumber(value.mergedAt);
}

/** Runtime guard shared by backup restore and Firestore journal shards. */
export function isValidJournalEntry(value: unknown): value is JournalEntry {
  if (!hasId(value) || !nonEmptyString(value.date) || typeof value.content !== "string") return false;
  if (!optionalString(value.title) || !optionalString(value.time) || !optionalString(value.question)) return false;
  if (value.tags !== undefined && !stringCollection(value.tags)) return false;
  if (value.photos !== undefined && !stringCollection(value.photos)) return false;
  if (value.audios !== undefined && !stringCollection(value.audios)) return false;
  if (!optionalString(value.photo) || !optionalString(value.audio)) return false;
  if (value.videoRefs !== undefined && !collectionOf(value.videoRefs, validVideoRef)) return false;
  if (value.attachmentRefs !== undefined && !collectionOf(value.attachmentRefs, validAttachment)) return false;
  if (value.audioMetadataRefs !== undefined && !collectionOf(value.audioMetadataRefs, validAudioMetadataRef)) return false;
  if (!optionalString(value.linkedBookId) || !optionalString(value.dayOneUUID)) return false;
  if (value.linkedTransactionIds !== undefined && !stringCollection(value.linkedTransactionIds)) return false;
  if (value.source !== undefined && value.source !== "dayOne" && value.source !== "manual") return false;
  if (!optionalBoolean(value.starred)) return false;
  if (value.location !== undefined && (
    !record(value.location)
    || !finiteNumber(value.location.lat)
    || !finiteNumber(value.location.lng)
    || !optionalString(value.location.place)
  )) return false;
  if (!optionalString(value.capturedAt) || !optionalString(value.timeZone) || !optionalString(value.modifiedAt)) return false;
  if (value.photoRefs !== undefined && !stringCollection(value.photoRefs)) return false;
  if (value.audioRefs !== undefined && !stringCollection(value.audioRefs)) return false;
  if (value.photoEdits !== undefined && (
    !record(value.photoEdits) || !Object.values(value.photoEdits).every(validPhotoEdit)
  )) return false;
  if (!optionalFiniteNumber(value.updatedAt)) return false;
  if (value.mood !== undefined && (!finiteNumber(value.mood) || !Number.isInteger(value.mood) || value.mood < 1 || value.mood > 5)) return false;
  if (value.mergedFrom !== undefined && !collectionOf(value.mergedFrom, validMergedSource)) return false;
  return true;
}

function validBook(value: unknown): value is Book {
  return hasId(value)
    && typeof value.title === "string"
    && typeof value.author === "string"
    && finiteNumber(value.totalPages)
    && finiteNumber(value.currentPage)
    && (value.status === "أقرأ" || value.status === "أنهيت" || value.status === "أريد_قراءة")
    && optionalString(value.startDate)
    && optionalString(value.finishDate)
    && optionalString(value.coverColor)
    && optionalFiniteNumber(value.rating)
    && optionalString(value.notes)
    && optionalFiniteNumber(value.updatedAt);
}

function validReadingLog(value: unknown): value is ReadingLog {
  return hasId(value)
    && typeof value.bookId === "string"
    && nonEmptyString(value.date)
    && finiteNumber(value.pagesRead)
    && optionalFiniteNumber(value.minutesRead)
    && optionalFiniteNumber(value.updatedAt);
}

function validKnowledgeSource(value: unknown): value is KnowledgeSource {
  return hasId(value)
    && SOURCE_KINDS.has(String(value.kind))
    && typeof value.name === "string"
    && optionalString(value.author)
    && optionalString(value.bookId)
    && nonEmptyString(value.createdAt)
    && optionalFiniteNumber(value.updatedAt);
}

function validBenefit(value: unknown): value is Benefit {
  return hasId(value)
    && optionalString(value.sourceId)
    && typeof value.text === "string"
    && optionalString(value.question)
    && optionalBoolean(value.applied)
    && nonEmptyString(value.createdAt)
    && optionalFiniteNumber(value.updatedAt);
}

function validShelfItem(value: unknown): value is ShelfItem {
  return hasId(value)
    && typeof value.name === "string"
    && finiteNumber(value.price)
    && optionalString(value.reason)
    && nonEmptyString(value.placedAt)
    && optionalString(value.releasedAt)
    && optionalString(value.boughtAt)
    && optionalString(value.transactionId)
    && optionalFiniteNumber(value.updatedAt);
}

function validHabit(value: unknown): value is Habit {
  return hasId(value)
    && typeof value.name === "string"
    && typeof value.icon === "string"
    && typeof value.color === "string"
    && stringCollection(value.logs)
    && optionalFiniteNumber(value.updatedAt);
}

function validRecurring(value: unknown): value is RecurringTransaction {
  return hasId(value)
    && finiteNumber(value.amount)
    && typeof value.category === "string"
    && typeof value.note === "string"
    && RECURRING_UNITS.has(String(value.unit))
    && finiteNumber(value.every)
    && finiteNumber(value.dayOfMonth)
    && nonEmptyString(value.anchorDate)
    && typeof value.active === "boolean"
    && optionalString(value.lastGenerated)
    && (value.generationMode === undefined || GENERATION_MODES.has(String(value.generationMode)))
    && optionalFiniteNumber(value.updatedAt)
    && optionalString(value.planId);
}

function validInstallmentPlan(value: unknown): value is InstallmentPlan {
  return hasId(value)
    && typeof value.provider === "string"
    && typeof value.name === "string"
    && optionalFiniteNumber(value.cashPrice)
    && finiteNumber(value.totalPrice)
    && finiteNumber(value.downPayment)
    && optionalString(value.downDate)
    && finiteNumber(value.installmentAmount)
    && finiteNumber(value.count)
    && nonEmptyString(value.firstDueDate)
    && optionalFiniteNumber(value.fees)
    && optionalFiniteNumber(value.finalPayment)
    && INSTALLMENT_STATUSES.has(String(value.status))
    && optionalString(value.category)
    && optionalString(value.recurringId)
    && optionalString(value.principalTxId)
    && optionalString(value.note)
    && nonEmptyString(value.createdAt)
    && optionalFiniteNumber(value.updatedAt);
}

function validAsset(value: unknown): value is Asset {
  return hasId(value)
    && typeof value.name === "string"
    && optionalString(value.icon)
    && nonEmptyString(value.purchaseDate)
    && finiteNumber(value.purchasePrice)
    && optionalFiniteNumber(value.salvageValue)
    && finiteNumber(value.lifeDays)
    && optionalString(value.planId)
    && optionalString(value.transactionId)
    && optionalString(value.soldDate)
    && optionalFiniteNumber(value.soldPrice)
    && optionalString(value.note)
    && nonEmptyString(value.createdAt)
    && optionalFiniteNumber(value.updatedAt);
}

function validBudget(value: unknown): boolean {
  return record(value)
    && typeof value.category === "string"
    && optionalFiniteNumber(value.limit)
    && optionalFiniteNumber(value.pct)
    && optionalFiniteNumber(value.updatedAt);
}

function validCategory(value: unknown): value is FinanceCategoryDef {
  return hasId(value)
    && typeof value.label === "string"
    && typeof value.icon === "string"
    && typeof value.color === "string"
    && optionalString(value.parentId)
    && optionalBoolean(value.allowSubs)
    && optionalFiniteNumber(value.updatedAt);
}

function validReserveDeposit(value: unknown): boolean {
  return hasId(value)
    && nonEmptyString(value.date)
    && finiteNumber(value.amount)
    && optionalString(value.note);
}

function validReserve(value: unknown): value is ReserveFund {
  return hasId(value)
    && typeof value.name === "string"
    && typeof value.icon === "string"
    && typeof value.color === "string"
    && optionalFiniteNumber(value.target)
    && collectionOf(value.deposits, validReserveDeposit)
    && nonEmptyString(value.createdAt)
    && optionalFiniteNumber(value.updatedAt);
}

function validPrayerLogs(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => {
    if (!record(item) || !nonEmptyString(item.date) || !record(item.prayers)) return false;
    if (!Object.entries(item.prayers).every(([name, status]) => PRAYER_NAMES.has(name) && PRAYER_STATUSES.has(String(status)))) return false;
    if (item.prayerUpdatedAt !== undefined && !numberMap(item.prayerUpdatedAt)) return false;
    if (!optionalFiniteNumber(item.sunan) || !optionalFiniteNumber(item.sunanUpdatedAt)) return false;
    if (item.qiyam !== undefined && (
      !record(item.qiyam)
      || !finiteNumber(item.qiyam.rakaat)
      || typeof item.qiyam.witr !== "boolean"
    )) return false;
    return optionalFiniteNumber(item.qiyamUpdatedAt);
  });
}

function validHifzPlan(value: unknown): boolean {
  return record(value)
    && finiteNumber(value.startId)
    && HIFZ_UNITS.has(String(value.unit))
    && finiteNumber(value.amount)
    && nonEmptyString(value.createdAt)
    && (value.intensity === undefined || HIFZ_INTENSITIES.has(String(value.intensity)));
}

function validHifzSession(value: unknown): boolean {
  return hasId(value)
    && nonEmptyString(value.date)
    && finiteNumber(value.fromId)
    && finiteNumber(value.toId)
    && (value.rating === undefined || (finiteNumber(value.rating) && Number.isInteger(value.rating) && value.rating >= 1 && value.rating <= 3))
    && optionalFiniteNumber(value.at)
    && optionalFiniteNumber(value.updatedAt);
}

function validHifzMistake(value: unknown): boolean {
  return hasId(value)
    && finiteNumber(value.ayahId)
    && (value.wordIndex === null || value.wordIndex === undefined || finiteNumber(value.wordIndex))
    && optionalString(value.word)
    && stringCollection(value.hits)
    && typeof value.resolved === "boolean"
    && nonEmptyString(value.updatedAt)
    && optionalFiniteNumber(value.okStreak)
    && optionalString(value.lastDrill);
}

function validHifz(value: unknown): boolean {
  if (!record(value)) return false;
  if (value.plan !== undefined && value.plan !== null && !validHifzPlan(value.plan)) return false;
  if (value.sessions !== undefined && !collectionOf(value.sessions, validHifzSession)) return false;
  if (value.reviews !== undefined && !collectionOf(value.reviews, validHifzSession)) return false;
  if (value.mistakes !== undefined && !collectionOf(value.mistakes, validHifzMistake)) return false;
  if (value.frontierId !== undefined && !finiteNumber(value.frontierId)) return false;
  if (value.deletedRecords !== undefined && !numberMap(value.deletedRecords)) return false;
  return optionalString(value.planId) && optionalString(value.lastTestDate)
    && optionalFiniteNumber(value.planUpdatedAt) && optionalFiniteNumber(value.frontierUpdatedAt);
}

function validQuranReflection(value: unknown): value is QuranReflection {
  return hasId(value)
    && nonEmptyString(value.date)
    && optionalFiniteNumber(value.surah)
    && optionalFiniteNumber(value.fromAyah)
    && optionalFiniteNumber(value.toAyah)
    && optionalString(value.reference)
    && typeof value.text === "string"
    && (value.tags === undefined || stringCollection(value.tags))
    && nonEmptyString(value.createdAt)
    && optionalFiniteNumber(value.updatedAt);
}

function validFutureLetter(value: unknown): value is FutureLetter {
  return hasId(value)
    && nonEmptyString(value.writtenDate)
    && nonEmptyString(value.deliveryDate)
    && optionalString(value.title)
    && typeof value.content === "string"
    && optionalBoolean(value.opened)
    && optionalString(value.openedDate)
    && optionalFiniteNumber(value.updatedAt);
}

function validCountdownEvent(value: unknown): value is CountdownEvent {
  return hasId(value)
    && nonEmptyString(value.title)
    && nonEmptyString(value.date)
    && optionalString(value.emoji)
    && optionalBoolean(value.countUpAfter)
    && optionalFiniteNumber(value.updatedAt);
}

function validKhatma(value: unknown): boolean {
  if (!record(value) || !finiteNumber(value.juz) || !finiteNumber(value.completed)) return false;
  if (!optionalFiniteNumber(value.page) || !optionalString(value.startDate) || !optionalString(value.lastReadDate)) return false;
  if (!optionalFiniteNumber(value.dailyPageGoal)) return false;
  return value.pageLog === undefined || (
    Array.isArray(value.pageLog)
    && value.pageLog.every((item) => record(item) && nonEmptyString(item.date) && finiteNumber(item.page))
  );
}

function validMeta(value: unknown): boolean {
  if (value === undefined) return true;
  if (!record(value)) return false;
  if (value.app !== undefined && value.app !== "madar") return false;
  if (value.backupVersion !== undefined && !finiteNumber(value.backupVersion)) return false;
  if (value.schemaVersion !== undefined && !finiteNumber(value.schemaVersion)) return false;
  if (value.createdAt !== undefined && typeof value.createdAt !== "string") return false;
  if (value.checksum !== undefined && typeof value.checksum !== "string") return false;
  return value.counts === undefined || (
    record(value.counts)
    && Object.values(value.counts).every((item) => Number.isSafeInteger(item) && (item as number) >= 0)
  );
}

/** Returns `true` only for a payload safe to pass to the restore preview. */
export function isValidBackupPayload(value: unknown): value is UnknownRecord & Partial<AppData> {
  if (!record(value) || !isValidTransactionCollection(value.transactions)) return false;
  if (!validMeta(value.__meta)) return false;

  const collectionValidators: Record<string, (item: unknown) => boolean> = {
    books: (item) => collectionOf(item, validBook),
    readingLogs: (item) => collectionOf(item, validReadingLog),
    knowledgeSources: (item) => collectionOf(item, validKnowledgeSource),
    benefits: (item) => collectionOf(item, validBenefit),
    shelfItems: (item) => collectionOf(item, validShelfItem),
    habits: (item) => collectionOf(item, validHabit),
    recurring: (item) => collectionOf(item, validRecurring),
    installmentPlans: (item) => collectionOf(item, validInstallmentPlan),
    assets: (item) => collectionOf(item, validAsset),
    categories: (item) => collectionOf(item, validCategory),
    reserves: (item) => collectionOf(item, validReserve),
    quranReflections: (item) => collectionOf(item, validQuranReflection),
    futureLetters: (item) => collectionOf(item, validFutureLetter),
    countdownEvents: (item) => collectionOf(item, validCountdownEvent),
  };
  for (const [field, validator] of Object.entries(collectionValidators)) {
    if (value[field] !== undefined && !validator(value[field])) return false;
  }
  if (value.journalEntries !== undefined && !collectionOf(value.journalEntries, isValidJournalEntry)) return false;
  if (value.budgets !== undefined && !collectionOf(value.budgets, validBudget)) return false;
  if (value.prayerLogs !== undefined && !validPrayerLogs(value.prayerLogs)) return false;
  if (value.quranWird !== undefined && !stringCollection(value.quranWird)) return false;
  if (value.quranHifz !== undefined && !validHifz(value.quranHifz)) return false;
  if (value.quranKhatma !== undefined && !validKhatma(value.quranKhatma)) return false;
  if (value.frozenHabits !== undefined && !stringCollection(value.frozenHabits)) return false;
  if (value.deleted !== undefined && !numberMap(value.deleted)) return false;
  if (value.deletedMedia !== undefined && !numberMap(value.deletedMedia)) return false;
  if (value.fieldUpdatedAt !== undefined && !numberMap(value.fieldUpdatedAt)) return false;
  if (value.merchantRules !== undefined && !stringMap(value.merchantRules)) return false;

  const qadaBacklog = value.qadaBacklog;
  if (qadaBacklog !== undefined && (typeof qadaBacklog !== "number" || !Number.isFinite(qadaBacklog) || qadaBacklog < 0)) return false;
  if (value.dailyBudget !== undefined && value.dailyBudget !== null && !record(value.dailyBudget)) return false;
  if (record(value.dailyBudget)) {
    if (!finiteNumber(value.dailyBudget.amount) || !nonEmptyString(value.dailyBudget.startDate)) return false;
    if (!optionalFiniteNumber(value.dailyBudget.monthlyIncome) || !optionalFiniteNumber(value.dailyBudget.incomePct) || !optionalFiniteNumber(value.dailyBudget.carryAdjust)) return false;
  }
  if (value.monthlyIncome !== undefined && value.monthlyIncome !== null && !finiteNumber(value.monthlyIncome)) return false;
  if (value.salaryDay !== undefined && !finiteNumber(value.salaryDay)) return false;
  if (value.budgetWindow !== undefined && value.budgetWindow !== "salary" && value.budgetWindow !== "month") return false;
  if (value.lastSalaryConfirm !== undefined && value.lastSalaryConfirm !== null && typeof value.lastSalaryConfirm !== "string") return false;
  if (value.readingGoal !== undefined && value.readingGoal !== null && !finiteNumber(value.readingGoal)) return false;
  if (value.lastUpdated !== undefined && !nonEmptyString(value.lastUpdated)) return false;
  return true;
}

function isValidTransactionCollection(value: unknown): value is Transaction[] {
  return collectionOf(value, isValidTransaction);
}
