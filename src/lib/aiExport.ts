import type { AppData, HifzMistake, JournalEntry, PrayerLog, QuranReflection, Transaction } from "./types";

export const AI_EXPORT_SECTIONS = ["journal", "finance", "prayer", "quran"] as const;
export type AiExportSection = (typeof AI_EXPORT_SECTIONS)[number];

export type AiExportPeriod =
  | { mode: "month"; value: string }
  | { mode: "year"; value: string }
  | { mode: "all" };

export interface AiExportOptions {
  period: AiExportPeriod;
  sections: AiExportSection[];
  redactFinance?: boolean;
  includeLocations?: boolean;
  includeMediaMetadata?: boolean;
  generatedAt?: string;
}

export interface AiExportPayload {
  format: "madar-ai-export";
  version: 1;
  generatedAt: string;
  period: AiExportPeriod;
  sections: AiExportSection[];
  privacy: {
    financeRedacted: boolean;
    locationsIncluded: boolean;
    mediaBytesIncluded: false;
    mediaMetadataIncluded: boolean;
    upload: "manual-only";
  };
  counts: Partial<Record<AiExportSection, number>>;
  data: Partial<Record<AiExportSection, unknown>>;
}

function inPeriod(date: unknown, period: AiExportPeriod): boolean {
  if (period.mode === "all") return true;
  if (typeof date !== "string") return false;
  if (period.mode === "month") return date.startsWith(period.value);
  return date.startsWith(period.value + "-");
}

function filterDates<T extends { date?: string }>(items: T[] | undefined, period: AiExportPeriod): T[] {
  return (items ?? []).filter((item) => inPeriod(item.date, period));
}

function filterDateStrings(items: string[] | undefined, period: AiExportPeriod): string[] {
  return (items ?? []).filter((date) => inPeriod(date, period));
}

function sorted<T extends { date?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")));
}

function categoryLabel(data: AppData, id: string | undefined): string | undefined {
  if (!id) return undefined;
  return data.categories?.find((category) => category.id === id)?.label ?? id;
}

function journalRecord(entry: JournalEntry, options: AiExportOptions): Record<string, unknown> {
  const record: Record<string, unknown> = {
    date: entry.date,
    time: entry.time,
    title: entry.title,
    question: entry.question,
    content: entry.content,
    tags: entry.tags,
    mood: entry.mood,
    source: entry.source,
    starred: entry.starred,
    linkedBookId: entry.linkedBookId,
    linkedTransactionIds: entry.linkedTransactionIds,
  };
  const photos = entry.photos?.length ?? (entry.photo ? 1 : 0);
  const audios = entry.audios?.length ?? (entry.audio ? 1 : 0);
  const videos = entry.videoRefs?.length ?? 0;
  const attachments = entry.attachmentRefs ?? [];
  const pdfAttachments = attachments.filter((attachment) => attachment.kind === "pdf");
  const fileAttachments = attachments.filter((attachment) => attachment.kind !== "pdf");
  const media: Record<string, unknown> = { photos, audios, videos, attachments: attachments.length, pdfs: pdfAttachments.length, files: fileAttachments.length };
  if (options.includeMediaMetadata) {
    media.pdfs = pdfAttachments.map((attachment) => ({
      filename: attachment.filename,
      contentType: attachment.contentType,
      size: attachment.size,
      status: attachment.status,
    }));
    media.files = fileAttachments.map((attachment) => ({
      filename: attachment.filename,
      contentType: attachment.contentType,
      size: attachment.size,
      status: attachment.status,
    }));
    media.videos = (entry.videoRefs ?? []).map((video) => ({
      type: video.type,
      duration: video.duration,
    }));
    media.audioNotes = (entry.audioMetadataRefs ?? []).map((audio) => ({
      type: audio.type,
      duration: audio.duration,
      filename: audio.filename,
      status: audio.status,
    }));
  }
  record.media = media;
  if (options.includeLocations && entry.location) {
    record.location = entry.location;
    record.capturedAt = entry.capturedAt;
    record.timeZone = entry.timeZone;
  }
  return record;
}

function financeTransaction(data: AppData, transaction: Transaction, redact: boolean): Record<string, unknown> {
  const record: Record<string, unknown> = {
    date: transaction.date,
    category: categoryLabel(data, transaction.category),
    planRole: transaction.planRole,
    deferred: transaction.deferred,
    offBudget: transaction.offBudget,
  };
  if (!redact) {
    record.amount = transaction.amount;
    record.note = transaction.note;
    record.planId = transaction.planId;
  }
  return record;
}

function financeData(data: AppData, period: AiExportPeriod, redact: boolean): Record<string, unknown> {
  const transactions = sorted(filterDates(data.transactions, period)).map((transaction) =>
    financeTransaction(data, transaction, redact)
  );
  const category = (id: string | undefined) => categoryLabel(data, id);
  const budgets = (data.budgets ?? []).map((budget) => ({
    category: category(budget.category),
    ...(redact ? {} : { limit: budget.limit, pct: budget.pct }),
  }));
  const reserves = (data.reserves ?? []).map((fund) => ({
    name: fund.name,
    target: redact ? undefined : fund.target,
    deposits: (fund.deposits ?? [])
      .filter((deposit) => inPeriod(deposit.date, period))
      .map((deposit) => ({
        date: deposit.date,
        ...(redact ? {} : { amount: deposit.amount, note: deposit.note }),
      })),
  }));
  const installmentPlans = (data.installmentPlans ?? [])
    .filter((plan) => period.mode === "all" || inPeriod(plan.createdAt, period) || inPeriod(plan.firstDueDate, period))
    .map((plan) => ({
      ...(redact ? {} : { provider: plan.provider, name: plan.name, note: plan.note }),
      status: plan.status,
      count: plan.count,
      firstDueDate: plan.firstDueDate,
      createdAt: plan.createdAt,
      category: category(plan.category),
      ...(redact
        ? {}
        : {
            totalPrice: plan.totalPrice,
            downPayment: plan.downPayment,
            installmentAmount: plan.installmentAmount,
            finalPayment: plan.finalPayment,
            fees: plan.fees,
          }),
    }));
  const recurring = (data.recurring ?? []).map((rule) => ({
    category: category(rule.category),
    unit: rule.unit,
    every: rule.every,
    dayOfMonth: rule.dayOfMonth,
    active: rule.active,
    generationMode: rule.generationMode,
    ...(redact ? {} : { amount: rule.amount, note: rule.note }),
  }));
  const assets = (data.assets ?? [])
    .filter((asset) => period.mode === "all" || inPeriod(asset.purchaseDate, period) || inPeriod(asset.soldDate, period))
    .map((asset) => ({
      ...(redact ? {} : { name: asset.name, note: asset.note }),
      purchaseDate: asset.purchaseDate,
      lifeDays: asset.lifeDays,
      ...(redact ? {} : { purchasePrice: asset.purchasePrice, salvageValue: asset.salvageValue, soldDate: asset.soldDate, soldPrice: asset.soldPrice }),
    }));
  return {
    transactions,
    categories: (data.categories ?? []).map((item) => ({ label: item.label })),
    budgets,
    reserves,
    installmentPlans,
    recurring,
    assets,
    ...(redact ? {} : { monthlyIncome: data.monthlyIncome, dailyBudget: data.dailyBudget }),
  };
}

function prayerData(data: AppData, period: AiExportPeriod): Record<string, unknown> {
  const logs = sorted(filterDates(data.prayerLogs, period)).map((log: PrayerLog) => ({
    date: log.date,
    prayers: log.prayers,
    sunan: log.sunan,
    qiyam: log.qiyam,
  }));
  return { logs, qadaBacklog: data.qadaBacklog ?? 0 };
}

function quranReflection(reflection: QuranReflection): Record<string, unknown> {
  return {
    date: reflection.date,
    reference: reflection.reference,
    surah: reflection.surah,
    fromAyah: reflection.fromAyah,
    toAyah: reflection.toAyah,
    text: reflection.text,
    tags: reflection.tags,
  };
}

function hifzMistake(mistake: HifzMistake, period: AiExportPeriod): Record<string, unknown> | null {
  const hits = filterDateStrings(mistake.hits, period);
  if (period.mode !== "all" && !hits.length && !inPeriod(mistake.updatedAt, period)) return null;
  return {
    ayahId: mistake.ayahId,
    wordIndex: mistake.wordIndex,
    word: mistake.word,
    hits,
    resolved: mistake.resolved,
    okStreak: mistake.okStreak,
    updatedAt: mistake.updatedAt,
  };
}

function quranData(data: AppData, period: AiExportPeriod): Record<string, unknown> {
  const hifz = data.quranHifz ?? { plan: null, frontierId: 0, sessions: [], reviews: [], mistakes: [] };
  const sessions = sorted((hifz.sessions ?? []).filter((item) => inPeriod(item.date, period)));
  const reviews = sorted((hifz.reviews ?? []).filter((item) => inPeriod(item.date, period)));
  const mistakes = (hifz.mistakes ?? []).map((item) => hifzMistake(item, period)).filter(Boolean);
  const pageLog = (data.quranKhatma?.pageLog ?? []).filter((item) => inPeriod(item.date, period));
  return {
    reflections: sorted(filterDates(data.quranReflections, period)).map(quranReflection),
    wird: filterDateStrings(data.quranWird, period),
    hifz: {
      plan: hifz.plan,
      frontierId: hifz.frontierId,
      sessions,
      reviews,
      mistakes,
      lastTestDate: hifz.lastTestDate,
    },
    khatma: { ...data.quranKhatma, pageLog },
  };
}

export function buildAiExport(data: AppData, options: AiExportOptions): AiExportPayload {
  const sections = AI_EXPORT_SECTIONS.filter((section) => options.sections.includes(section));
  const redact = options.redactFinance === true;
  const includeLocations = options.includeLocations === true;
  const includeMediaMetadata = options.includeMediaMetadata === true;
  const payloadData: Partial<Record<AiExportSection, unknown>> = {};
  const counts: Partial<Record<AiExportSection, number>> = {};
  if (sections.includes("journal")) {
    const entries = sorted(filterDates(data.journalEntries, options.period)).map((entry) =>
      journalRecord(entry, options)
    );
    payloadData.journal = { entries };
    counts.journal = entries.length;
  }
  if (sections.includes("finance")) {
    const finance = financeData(data, options.period, redact);
    payloadData.finance = finance;
    counts.finance = Array.isArray(finance.transactions) ? finance.transactions.length : 0;
  }
  if (sections.includes("prayer")) {
    const prayer = prayerData(data, options.period);
    payloadData.prayer = prayer;
    counts.prayer = Array.isArray(prayer.logs) ? prayer.logs.length : 0;
  }
  if (sections.includes("quran")) {
    const quran = quranData(data, options.period);
    payloadData.quran = quran;
    counts.quran = Array.isArray(quran.reflections) ? quran.reflections.length : 0;
  }
  return {
    format: "madar-ai-export",
    version: 1,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    period: options.period,
    sections,
    privacy: {
      financeRedacted: redact,
      locationsIncluded: includeLocations,
      mediaBytesIncluded: false,
      mediaMetadataIncluded: includeMediaMetadata,
      upload: "manual-only",
    },
    counts,
    data: payloadData,
  };
}

export function aiExportJson(payload: AiExportPayload): string {
  return JSON.stringify(payload, null, 2);
}

export function aiExportMarkdown(payload: AiExportPayload): string {
  const fence = String.fromCharCode(96).repeat(3);
  const summary = Object.entries(payload.counts)
    .map(([section, count]) => "- " + section + ": " + String(count))
    .join("\n");
  return [
    "# تصدير مدار للتحليل",
    "",
    "حلّل البيانات الموجودة في هذا الملف فقط. لا تخمّن ما ليس موجوداً، واذكر بوضوح أي نقص أو تناقض.",
    "هذا تصدير يدوي؛ لم تُرفع البيانات تلقائياً إلى أي خدمة.",
    "",
    "## النطاق",
    "",
    "- الفترة: " + JSON.stringify(payload.period),
    "- الأقسام: " + payload.sections.join("، "),
    "- عدد السجلات:",
    summary || "- لا توجد أقسام محددة",
    "",
    "## البيانات (JSON)",
    "",
    fence + "json",
    aiExportJson(payload),
    fence,
    "",
  ].join("\n");
}
