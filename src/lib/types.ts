// Categories are fully user-managed (add/rename/delete freely), the same
// way habits are — not a fixed list. Transactions/recurring rules/budgets
// reference a category by id; DEFAULT_CATEGORIES below just seeds new
// accounts with a starting set.
// Two levels: a main category (no parentId) and its sub-categories
// (parentId = the main category's id). Totals/budgets roll up to the main.
export interface FinanceCategoryDef {
  id: string;
  label: string;
  icon: string;
  color: string;
  parentId?: string;
  // Only mains with this flag get sub-categories (per the user's setup:
  // أساسيات وكماليات فقط) — the sub row/inline-add UI hides elsewhere.
  allowSubs?: boolean;
  // طابع آخر تعديلٍ لهذا العنصر (ms) — يفوز به التعديل الأحدث في الدمج
  // عبر جهازين، فلا يرجع تعديلٌ للخلف لأنّ ختم مستند الجهاز الآخر أحدث إجمالاً.
  updatedAt?: number;
}

// Colors drawn from the app's warm Andalusian palette (terracotta / gold /
// green / teal / soft purple) so the finance charts sit in the same theme.
export const DEFAULT_CATEGORIES: FinanceCategoryDef[] = [
  { id: "cat-essentials", label: "أساسيات", icon: "🧺", color: "#c1663f", allowSubs: true },
  { id: "cat-luxuries", label: "كماليات", icon: "✨", color: "#c9852a", allowSubs: true },
  { id: "cat-investment", label: "استثمار", icon: "📊", color: "#3d9640" },
  { id: "cat-charity", label: "صدقة", icon: "🤲", color: "#1f7a6c" },
  { id: "cat-others", label: "للآخرين", icon: "🎁", color: "#8a6fb0" },
];

// Shown for a transaction/budget whose category was since deleted, instead
// of crashing or silently dropping the entry.
export const UNKNOWN_CATEGORY: FinanceCategoryDef = { id: "", label: "غير مصنف", icon: "📌", color: "#888" };

// How an expense is funded. By default 100% comes out of the daily
// cumulative budget; `reserveSplits` moves part (or all) of it onto one or
// more reserve funds instead — e.g. a gift paid 50% from the daily budget
// and 50% from the الاحتياطي envelope. The percentages here are the reserve
// shares; whatever remains up to 100% is the daily-budget share.
export interface ReserveSplit {
  fundId: string; // ReserveFund id
  pct: number; // 1-100
}

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  category: string; // FinanceCategoryDef id
  note: string;
  linkedJournalId?: string;
  reserveSplits?: ReserveSplit[];
  // ختم آخر تعديل (ms). يستخدمه دمج المزامنة ليفوز التعديل الأحدث لهذا العنصر
  // بعينه، لا التعديل من الجهاز صاحب أحدث ختم على مستوى المستند كله.
  updatedAt?: number;
  // ===== ربط المعاملة بخطة أقساط (اختياري) =====
  // المعاملة تمثّل **دوراً واحداً فقط** في الخطة — الحقل مفردٌ لا مصفوفة، فلا
  // يمكن بنيوياً أن تكون «دفعة أولى» و«قسطاً» في الوقت نفسه. دفعاتُ الخطة مصاريف
  // عادية في كل الحسابات (الميزانية اليومية والسقوف)؛ الخطة تقرأها ولا تملكها.
  planId?: string; // InstallmentPlan id
  planRole?: InstallmentRole;
  planInstallmentNo?: number; // رقم القسط (1..count) — للأقساط والدفعة الأخيرة فقط
  planLinkedAt?: number; // ms وقت الربط بالخطة
  // **الشراء المؤجّل (مهب كاش)**: سُجّل كالتزامٍ ولم يخرج من الحساب — «الأصل» الذي
  // تُسدّده الأقساط. يظهر في السجل بوسم «مؤجّل» ولا يُحتسب في أيّ صرف (ولا ريال):
  // لا الميزانية اليومية، ولا السقوف، ولا الرسوم البيانية، ولا الإحصائيات. ما
  // يُحتسب هو الدفعات الفعلية — وإلا حُسب الشراء مرّتين (1200 ثمّ 12×100).
  // البوابة الوحيدة لهذا القرار: `cashOut` / `isCashOut` في utils.ts.
  deferred?: boolean;
  // **مصروفٌ خارج الميزانيات**: خرج من الجيب فعلاً (يظهر في السجل والإحصائيات
  // ومجاميع الصرف كأيّ مصروف)، لكنّه استثنائيّ غير متكرّر — رسوم اختبارٍ مثلاً —
  // فلا يصحّ أن يستهلك الميزانية اليومية ولا سقوف الأقسام فيبدو الشهر منفلتاً.
  // البوابة الوحيدة لهذا القرار: `budgetSpend` / `countsInBudget` في utils.ts.
  offBudget?: boolean;
}

// ===================== Reserve funds (الاحتياطي) =====================

// A labeled envelope of money set aside for a purpose (rent, a trip, ...).
// Deposits top it up; expenses charged to it via reserveSplits drain it.
// Its live balance is always derived: sum(deposits) − sum(charged shares),
// so editing/deleting a transaction can never desync the fund.
export interface ReserveDeposit {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number; // positive = تعبئة, negative = سحب يدوي
  note?: string;
}

export interface ReserveFund {
  id: string;
  name: string; // e.g. "الإيجار", "سفرة الصيف"
  icon: string; // any emoji
  color: string;
  target?: number; // optional goal amount for the envelope
  deposits: ReserveDeposit[];
  createdAt: string; // YYYY-MM-DD
  // طابع آخر تعديلٍ لهذا العنصر (ms) — يفوز به التعديل الأحدث في الدمج
  // عبر جهازين، فلا يرجع تعديلٌ للخلف لأنّ ختم مستند الجهاز الآخر أحدث إجمالاً.
  updatedAt?: number;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  totalPages: number;
  currentPage: number;
  status: "أقرأ" | "أنهيت" | "أريد_قراءة";
  startDate?: string;
  finishDate?: string;
  coverColor?: string;
  rating?: number; // 1-5
  notes?: string;
  // طابع آخر تعديلٍ لهذا العنصر (ms) — يفوز به التعديل الأحدث في الدمج
  // عبر جهازين، فلا يرجع تعديلٌ للخلف لأنّ ختم مستند الجهاز الآخر أحدث إجمالاً.
  updatedAt?: number;
}

export interface ReadingLog {
  id: string;
  bookId: string;
  date: string; // YYYY-MM-DD
  pagesRead: number;
  minutesRead?: number;
  // طابع آخر تعديلٍ لهذا العنصر (ms) — يفوز به التعديل الأحدث في الدمج
  // عبر جهازين، فلا يرجع تعديلٌ للخلف لأنّ ختم مستند الجهاز الآخر أحدث إجمالاً.
  updatedAt?: number;
}

export interface JournalEntry {
  id: string;
  date: string; // YYYY-MM-DD
  title?: string; // عنوان اليوم — يظهر فوق بخط أكبر وغامق
  time?: string; // HH:MM وقت الكتابة
  question?: string; // سؤال اليوم الذي كُتبت حوله المذكرة
  content: string;
  tags?: string[];
  photo?: string; // base64 WebP compressed — legacy single photo
  photos?: string[]; // عدة صور للمذكرة (الأحدث؛ photo يبقى للتوافق)
  audio?: string; // ملاحظة صوتية (base64 data URL) — الأولى؛ audios يحمل الكل
  audios?: string[]; // عدة ملاحظات صوتية (audio يبقى للتوافق = الأولى)
  // إشارات مقاطع فيديو مستوردة من Day One/مستورد الذكريات — لا يُخزَّن الملف
  // نفسه (كبير ولا يتزامن)، فقط تذكير بأن التدوينة فيها مقطع (النوع + المدة
  // إن وُجدت). posterHash مرجع هاش R2 (kind=photos) للقطة غلاف الفيديو حين
  // رفعها مستورد الذكريات — مُنفصلٌ عمداً عن photoRefs (ليست صورةً حقيقية من
  // المذكرة، بل معاينةٌ لمقطع)؛ يُتحقّق من وجوده في R2 كأي هاش صورة عادي عبر
  // sync.ts#verifyMediaHashesPresent قبل الاستيراد رغم بقائه هنا لا في photoRefs.
  // sourceMediaID (=media.id من مانيفست .madarimport) هويّةٌ ثابتة للدمج —
  // تميّز الوسيط حتى لو تطابقت type/duration مع وسيطٍ آخر فعلاً مختلف، وتوحّد
  // نسخة metadataOnly مع نسخة uploaded اللاحقة لنفس الوسيط رغم اختلاف حقولها.
  // غيابه (مراجع أقدم من هذا الحقل) يُسقط الدمج لحقول type/duration كـfallback
  // (راجع mergeRefList في utils.ts).
  videoRefs?: { type?: string; duration?: number; posterHash?: string; sourceMediaID?: string }[];
  // إشارات مرفقاتٍ غير صورةٍ/صوتٍ/فيديو (مستورد الذكريات) — اليوم PDF فقط،
  // لكن kind مصفوفةٌ لا حقلٌ ثابت تحسّباً لنوعٍ لاحق. previewHash مرجع هاش R2
  // (kind=photos) لمعاينة أول صفحة إن رُفعت — منفصلٌ عن photoRefs لنفس سبب
  // posterHash أعلاه. status ("uploaded"/"metadataOnly"/"missing"/"failed"،
  // كما وردت من مستورد الذكريات) يُبقي المعرفة بوجود مرفقٍ حتى بلا معاينة.
  // sourceMediaID كما في videoRefs أعلاه.
  attachmentRefs?: { kind: "pdf"; filename?: string; previewHash?: string; status: string; sourceMediaID?: string }[];
  // بيانات وصفية لملاحظةٍ صوتية من مستورد الذكريات — تُملأ **دائماً** حين
  // يذكر المصدر صوتاً، حتى لو status="metadataOnly" بلا cloudHash (بايتات
  // الصوت القابلة للتشغيل، إن وُجدت، تعيش في audioRefs وحدها؛ هذا الحقل وصفٌ
  // إضافي لا مصدر تشغيل). sourceMediaID كما في videoRefs أعلاه.
  audioMetadataRefs?: { type?: string; duration?: number; filename?: string; status: string; sourceMediaID?: string }[];
  linkedBookId?: string;
  linkedTransactionIds?: string[];
  source?: "dayOne" | "manual";
  dayOneUUID?: string;
  starred?: boolean;
  // موقعٌ جغرافيّ اختياري (مستورد الذكريات) — لا يظهر إلا حين يوفّره المصدر.
  location?: { lat: number; lng: number; place?: string };
  // لحظة الالتقاط الأصليّة ومنطقتها الزمنية (ISO/IANA) — أدقّ من date/time
  // المشتقَّين محلياً، تُحفظ كما وردت من المصدر بلا تحويل.
  capturedAt?: string;
  timeZone?: string;
  // آخر تعديلٍ على *الجهاز المصدر* قبل الاستيراد (يختلف عن updatedAt أدناه،
  // وهو ختم مدار الداخلي لحسم تعارض الدمج).
  modifiedAt?: string;
  // مراجع وسائط بصيغة هاش محتوى **بلا بايتات محلية بعد** — تُملأ عند استيراد
  // مصدرٍ رفع الوسائط إلى R2 مسبقاً (مستورد الذكريات عبر src/lib/madarBridge.ts)
  // بدل تضمين البايتات في الملف نفسه. دورة المزامنة التالية (hydrateCloudPhotos
  // في sync.ts) تُرطّبها إلى photos/audios الفعلية تلقائياً — نفس الآلية التي
  // تُبقي مرجعاً لم يُنزَّل بعد على نسخة السحابة (راجع sync.ts).
  photoRefs?: string[];
  audioRefs?: string[];
  // ختم آخر تعديل (ms) — يفوز به التعديل الأحدث لهذه المذكرة بعينها في دمج
  // المزامنة، فلا يضيع تعديلٌ حديث على جهاز بسبب ختم مستندٍ أحدث على جهاز آخر.
  updatedAt?: number;
  mood?: 1 | 2 | 3 | 4 | 5; // «شعور اليوم» اختياري (١ صعب … ٥ رائع) — لمراجعة الشهر
}

// رموز «شعور اليوم» الخمسة (اختياري تماماً — لا يظهر قبل الكتابة، ولا نحلّل النصّ).
export const MOODS: { value: 1 | 2 | 3 | 4 | 5; emoji: string; label: string }[] = [
  { value: 1, emoji: "😔", label: "صعب" },
  { value: 2, emoji: "🙁", label: "ثقيل" },
  { value: 3, emoji: "😐", label: "عادي" },
  { value: 4, emoji: "🙂", label: "جميل" },
  { value: 5, emoji: "😄", label: "رائع" },
];

export interface Habit {
  id: string;
  name: string;
  icon: string;
  color: string;
  logs: string[]; // dates YYYY-MM-DD
  // طابع آخر تعديلٍ لهذا العنصر (ms) — يفوز به التعديل الأحدث في الدمج
  // عبر جهازين، فلا يرجع تعديلٌ للخلف لأنّ ختم مستند الجهاز الآخر أحدث إجمالاً.
  updatedAt?: number;
}

// ===================== Prayers =====================

export type PrayerName = "الفجر" | "الظهر" | "العصر" | "المغرب" | "العشاء";

export const PRAYERS: PrayerName[] = ["الفجر", "الظهر", "العصر", "المغرب", "العشاء"];

// لم: لم تُصلَّ بعد · منفردة: صليت وحدك · جماعة: صليت بالمسجد/جماعة
export type PrayerStatus = "لم" | "منفردة" | "جماعة";

export interface PrayerLog {
  date: string; // YYYY-MM-DD
  prayers: Partial<Record<PrayerName, PrayerStatus>>;
  // طابع آخر تعديل **لكلّ صلاةٍ على حدة** (ms). اليوم خمس قيمٍ مستقلّة: تسجيل
  // العشاء على الجوّال يجب ألّا يفوز على تصحيح الفجر في اليوم نفسه على الآيباد،
  // وهو ما يفعله طابعٌ واحدٌ لليوم. الدمج يحسم كلّ صلاةٍ بطابعها.
  prayerUpdatedAt?: Partial<Record<PrayerName, number>>;
}

export const PRAYER_META: Record<PrayerName, { icon: string; angle: number }> = {
  // angle: stylised position (degrees) along the dawn→night sky arc widget
  الفجر: { icon: "🌅", angle: 172 },
  الظهر: { icon: "☀️", angle: 116 },
  العصر: { icon: "🌤️", angle: 74 },
  المغرب: { icon: "🌇", angle: 36 },
  العشاء: { icon: "🌙", angle: 8 },
};

export const PRAYER_STATUS_META: Record<PrayerStatus, { label: string; short: string; color: string }> = {
  لم: { label: "لم تُصلَّ بعد", short: "لم", color: "#cbb894" },
  منفردة: { label: "صليت منفرداً", short: "منفردة", color: "#dc9f3c" },
  جماعة: { label: "صليت بالمسجد", short: "بالمسجد", color: "#1f7a6c" },
};

// **البوابة الوحيدة** لقراءة وصفِ حالة الصلاة — لا تفهرس `PRAYER_STATUS_META`
// مباشرةً في مكوّن.
//
// الفهرسة المباشرة تُرجع `undefined` لأيّ قيمةٍ خارج الثلاث، وقراءةُ `.color`
// منها ترمي — فتسقط **كلّ صفحات التطبيق** لا بطاقةُ الصلاة وحدها، لأنّ الشريط
// الجانبي والترويسة والصفحة في شجرةٍ واحدة تحرسها حدودُ خطأٍ واحدة. وقيمةٌ
// خارج الثلاث ليست فرضاً نظرياً: البيانات تدخل من نسخةٍ احتياطية، ومن دمجِ
// السحابة مع جهازٍ بإصدارٍ أقدم — وكلاهما خارج سيطرة كُتّاب التطبيق.
//
// نفس مبدأ `UNKNOWN_CATEGORY` أعلاه: اعرِض بديلاً محايداً ولا تنهر.
export function prayerStatusMeta(status: PrayerStatus | string | undefined) {
  return PRAYER_STATUS_META[status as PrayerStatus] ?? PRAYER_STATUS_META["لم"];
}

// Base repeat unit — "every" multiplies it, so (unit: شهري, every: 6) is a
// semi-annual expense, (every: 12) is annual, (every: 18) every year and a
// half, and so on — arbitrary spacing instead of a fixed monthly/yearly pair.
export type RecurringUnit = "أسبوعي" | "شهري";

// كيف يتصرّف الالتزام المتكرّر في موعده:
//  • auto     — تُنشأ معاملةٌ تلقائياً (السلوك التاريخي، وهو الافتراضي عند الغياب).
//  • reminder — تذكيرٌ فقط: يظهر في «القادم قريباً» و«أقرب التزام» ولا يولّد معاملة.
//    خطط الأقساط تستعمل هذا الوضع حصراً — الدفع يُسجّل يدوياً بمبلغه الفعلي، فلا
//    تُخلَق مصاريف وهمية لقسطٍ لم يُدفع.
// غياب الحقل (بياناتٌ قديمة) = "auto" دائماً — راجع generationModeOf في utils.ts.
export type RecurringGenerationMode = "auto" | "reminder";

export interface RecurringTransaction {
  id: string;
  amount: number;
  category: string; // FinanceCategoryDef id
  note: string;
  unit: RecurringUnit;
  every: number; // repeat every N units
  dayOfMonth: number; // weekday 0-6 for أسبوعي, day-of-month 1-28 for شهري
  anchorDate: string; // YYYY-MM-DD — first occurrence; interval phase is counted from here
  active: boolean;
  lastGenerated?: string; // YYYY-MM-DD of last auto-created instance
  generationMode?: RecurringGenerationMode; // غيابه = "auto"
  // ختم آخر تعديل (ms) — يفوز به التعديل الأحدث لهذه القاعدة بعينها في الدمج.
  // لا يُختم عند التوليد التلقائي (تحديث lastGenerated) كي لا يطغى توليدٌ آليّ
  // على تعديلٍ حقيقيّ من الجهاز الآخر؛ lastGenerated يُدمج بأخذ الأحدث تاريخياً.
  updatedAt?: number;
  planId?: string; // خطة الأقساط التي أنشأت هذا التذكير (إن وُجدت)
}

// Quick presets shown in the UI on top of the free "every N" input.
export const RECURRING_PRESETS: { label: string; unit: RecurringUnit; every: number }[] = [
  { label: "أسبوعي", unit: "أسبوعي", every: 1 },
  { label: "كل أسبوعين", unit: "أسبوعي", every: 2 },
  { label: "شهري", unit: "شهري", every: 1 },
  { label: "كل شهرين", unit: "شهري", every: 2 },
  { label: "ربع سنوي", unit: "شهري", every: 3 },
  { label: "كل 4 أشهر", unit: "شهري", every: 4 },
  { label: "نصف سنوي", unit: "شهري", every: 6 },
  { label: "سنوي", unit: "شهري", every: 12 },
];

// ===================== الأقساط (خطط التقسيط) =====================
// خطةُ تقسيطٍ لالتزامٍ واحد (جوّال بالتقسيط، أثاث، تأمين مجزّأ...). الخطة **وصفٌ
// للاتفاق فقط**؛ لا تنشئ مصروفاً بنفسها ولا تحرّك أيّ رصيد. كل ريالٍ يُحتسب حين
// تُسجَّل معاملةٌ حقيقية مربوطة بها (Transaction.planId) — فلا يظهر قسطٌ كمصروفٍ
// لمجرّد مرور موعده، ولا يتضخّم صرف الشهر بأرقامٍ لم تُدفع.
//
// `totalPrice` هو **المرجع الوحيد** للمبلغ الواجب: الرسوم توضيحيةٌ لا تُضاف عليه،
// و`cashPrice` للمقارنة فقط. `finalPayment` (دفعةٌ أخيرة كبيرة) **تستبدل** آخر قسط
// ولا تُضاف إليه. إن لم تتّسق الأرقام مع الإجمالي فالعرض يحمل تحذيراً **غير
// معطِّل** (لا نصحّح أرقام المالك من تلقائنا) — راجع planMismatch في installments.ts.
export type InstallmentStatus = "active" | "settled" | "cancelled";

// دور المعاملة داخل الخطة — واحدٌ فقط لكل معاملة:
//  principal  = **الأصل المؤجّل**: الشراء نفسه حين لم يكن كاش (اشتريتَ بالتقسيط).
//               التزامٌ لا صرف: يحمل `deferred` فلا يُحتسب ريالاً واحداً في أيّ
//               حساب، والأقساط هي التي تُسدّده. ليس دفعةً ولا يدخل «المدفوع».
//  down       = الدفعة الأولى · installment = قسط · final = الدفعة الأخيرة الكبيرة
//  settlement = سدادٌ مبكر (يُسجَّل بمبلغه الفعليّ وحده؛ الفرق يُعرَض «موفَّراً»
//               ولا يُخلَق له مصروفٌ وهميّ).
export type InstallmentRole = "principal" | "down" | "installment" | "final" | "settlement";

export interface InstallmentPlan {
  id: string;
  provider: string; // الجهة (تمارا · تابي · بنك · معرض...)
  name: string; // اسم الالتزام
  cashPrice?: number; // السعر النقدي (اختياري — للمقارنة فقط، لا يدخل أيّ حساب)
  totalPrice: number; // السعر الإجمالي — المرجع الوحيد للمبلغ الواجب
  downPayment: number; // الدفعة الأولى (0 = لا دفعة أولى)
  // يوم دفع الدفعة الأولى — تُسجَّل مصروفاً حقيقياً بهذا التاريخ لحظة إنشاء الخطة
  // (دفعةٌ خرجت فعلاً، لا موعدٌ مستقبليّ). غيابه (خططٌ قديمة) = يوم الإنشاء.
  downDate?: string; // YYYY-MM-DD
  installmentAmount: number; // قيمة القسط الشهري
  count: number; // عدد الأقساط
  firstDueDate: string; // YYYY-MM-DD أول موعد استحقاق
  fees?: number; // الرسوم — توضيحية فقط (لا تُضاف على الإجمالي)
  finalPayment?: number; // دفعة أخيرة كبيرة تستبدل آخر قسط (اختياري)
  status: InstallmentStatus;
  category?: string; // FinanceCategoryDef id يُقترح لمدفوعات الخطة
  recurringId?: string; // ربط اختياري بالتزامٍ متكرّر (تذكير reminder فقط)
  // معاملة «الأصل المؤجّل» التي تُسدّدها هذه الخطة (إن كان الشراء مسجَّلاً أصلاً
  // كمصروفٍ ثمّ قُسِّط). المعاملة نفسها تحمل `deferred` + `planRole: "principal"`.
  principalTxId?: string;
  note?: string;
  createdAt: string; // YYYY-MM-DD
  updatedAt?: number; // ms — يفوز به التعديل الأحدث لهذه الخطة في الدمج
}

// ===================== الأصول والاستهلاك (الإهلاك) =====================
// «أصل» = شيءٌ غالٍ اشتريتَه وتملكه ويخدمك سنين (جوّال، لابتوب، أثاث، سيارة)،
// لا مصروفاً يومياً ينتهي بيومه. الفكرة الوحيدة هنا: **الكلفة تتوزّع على أيام
// الاستعمال لا على يوم الشراء**، فتعرف «كم يكلّفني هذا الشيء في اليوم فعلاً»
// و«كم بقي من قيمته».
//
// النموذج مقصودٌ بسيطاً: إهلاكٌ خطّيٌّ يوميّ (كل يومٍ ينقص القيمة بمقدارٍ ثابت)
// لأنه الوحيد الذي يمكن للمالك أن يتحقّق منه ذهنياً. العمر «على كيفك» بالأيام —
// تختار سنةً أو ثلاثاً أو رقماً حرّاً.
//
// **لا يمسّ الأصلُ أيّ صرف**: الإهلاك عرضٌ محاسبيّ محض ولا يولّد معاملةً ولا
// يدخل الميزانية اليومية ولا السقوف. المصروف الحقيقي هو ثمن الشراء (أو الأقساط)
// حين سُجّل، ولا يجوز احتسابه مرّةً ثانيةً كإهلاك.
export interface Asset {
  id: string;
  name: string; // «آيفون ١٦»، «لابتوب العمل»، «كنب المجلس»
  icon?: string; // إيموجي اختياري
  purchaseDate: string; // YYYY-MM-DD يوم امتلاكه (بداية الإهلاك)
  purchasePrice: number; // ثمنه كاملاً (لا يهمّ أدُفع كاشاً أم بالتقسيط)
  // القيمة المتوقّعة في نهاية العمر (ما تظنّ أنك ستبيعه به). 0 = يستهلك كلياً.
  salvageValue?: number;
  lifeDays: number; // العمر الافتراضي بالأيام (≥ 1) — «على كيفك»
  planId?: string; // خطة الأقساط التي اشتريته بها (إن وُجدت) — ربطٌ للعرض فقط
  transactionId?: string; // معاملة الشراء (إن رُبطت) — للعرض فقط
  // البيع/التخلّص: يوقف الإهلاك عند هذا اليوم ويحسب الربح/الخسارة الفعليّ
  // (ثمن البيع − القيمة الدفترية يومَها). لا يولّد معاملةً أيضاً.
  soldDate?: string; // YYYY-MM-DD
  soldPrice?: number;
  note?: string;
  createdAt: string; // YYYY-MM-DD
  updatedAt?: number; // ms — يفوز به التعديل الأحدث لهذا الأصل في الدمج
}

// أعمارٌ جاهزة بضغطة (والحقل الحرّ باقٍ دائماً) — أيامٌ لا شهور، فالحساب يوميّ.
export const ASSET_LIFE_PRESETS: { label: string; days: number }[] = [
  { label: "سنة", days: 365 },
  { label: "سنتان", days: 730 },
  { label: "٣ سنوات", days: 1095 },
  { label: "٥ سنوات", days: 1825 },
  { label: "١٠ سنوات", days: 3650 },
];

// A monthly cap on a main category — either a fixed SAR amount or a
// percentage of the monthly income (pct wins when both are set, and the
// effective cap follows the income automatically if it changes).
// نافذة حساب السقوف — راجع budgetCycle.ts.
export type BudgetWindowMode = "salary" | "month";

export interface Budget {
  category: string; // FinanceCategoryDef id
  limit?: number; // fixed monthly cap in SAR
  pct?: number; // 1-100 — share of monthlyIncome
  // طابع آخر تعديلٍ لهذا العنصر (ms) — يفوز به التعديل الأحدث في الدمج
  // عبر جهازين، فلا يرجع تعديلٌ للخلف لأنّ ختم مستند الجهاز الآخر أحدث إجمالاً.
  updatedAt?: number;
}

// A personal daily spending allowance that rolls over — under-spend one day
// and it cushions the next, overspend and it eats into it. Cumulative since
// startDate, not reset every calendar month.
export interface DailyBudget {
  amount: number; // SAR per day — always the resolved figure every calculation uses
  startDate: string; // YYYY-MM-DD — changing the amount resets this to today
  // Set when the amount was derived as a percentage of monthly income
  // (amount = monthlyIncome × incomePct / 100 / 30) — kept so the editor
  // can reopen in that mode and the card can explain where the number
  // came from. Absent for a plain fixed amount.
  monthlyIncome?: number;
  incomePct?: number;
  // Adjustment subtracted from the cumulative allowance after a سحب/ترحيل
  // (نزول الراتب / نقل الفائض للاحتياطي). Lets the new cycle start from today
  // (so same-day-after expenses still count) without re-granting the day's
  // allowance that was already settled by the sweep. Absent = plain cycle.
  carryAdjust?: number;
}

// رسالة لنفسك المستقبلية — تُقفل حتى تاريخ التسليم ثم تُفتح باحتفال.
// ===================== الأحداث المهمّة (العدّ التنازلي) =====================
// حدثٌ له تاريخٌ واحد يُعدّ إليه: اختبار، ولادة، سفر، موعد. لا تكرار ولا تنبيه
// — بطاقةٌ تقول «كم بقي» وحسب. `date` مفتاحٌ محليّ YYYY-MM-DD (لا ISO/UTC، فهو
// يومٌ في تقويم المالك لا لحظةٌ زمنية)، و`allDay` ليست حقلاً لأن كلّ حدثٍ يوم.
export interface CountdownEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  emoji?: string;
  // يبقى معروضاً بعد مروره كـ«مضى كذا يوماً» بدل أن يختفي — لحظةُ ميلادٍ مثلاً
  // يريد المالك عدّ الأيام منها لا إليها. الافتراضي: يُخفى بعد يومٍ من مروره.
  countUpAfter?: boolean;
  // طابع آخر تعديلٍ لهذا العنصر (ms) — كبقيّة العناصر المعرّفة بـid.
  updatedAt?: number;
}

export interface FutureLetter {
  id: string;
  writtenDate: string; // YYYY-MM-DD
  deliveryDate: string; // YYYY-MM-DD
  title?: string;
  content: string;
  opened?: boolean;
  openedDate?: string;
  // طابع آخر تعديلٍ لهذا العنصر (ms) — يفوز به التعديل الأحدث في الدمج
  // عبر جهازين، فلا يرجع تعديلٌ للخلف لأنّ ختم مستند الجهاز الآخر أحدث إجمالاً.
  updatedAt?: number;
}

// ===================== القرآن =====================

// تأمّل على آية — نصّ حرّ يكتبه المستخدم مربوطاً باختيارٍ حرّ لأي آية أو مقطع
// (سورة + مدى آيات). reference نصّ مشتقّ للعرض والتوافق مع التأمّلات القديمة.
export interface QuranReflection {
  id: string;
  date: string; // YYYY-MM-DD
  surah?: number; // 1..114 (اختياري — قد يكون تأمّلاً حرّاً بلا مرجع)
  fromAyah?: number;
  toAyah?: number;
  reference?: string; // مرجع نصّي مشتقّ (مثل «الرعد 28») — للعرض والتوافق القديم
  text: string; // نصّ التأمّل
  tags?: string[]; // وسوم اختيارية (إيمان، صبر، رزق، دعاء…) — للبحث والفلترة
  createdAt: string; // YYYY-MM-DD وقت الإنشاء (للترتيب الثانوي)
  // طابع آخر تعديلٍ لهذا العنصر (ms) — يفوز به التعديل الأحدث في الدمج
  // عبر جهازين، فلا يرجع تعديلٌ للخلف لأنّ ختم مستند الجهاز الآخر أحدث إجمالاً.
  updatedAt?: number;
}

// ===================== خطة الحفظ (متتابعة) =====================
// الحفظ متتابعٌ عبر المصحف من نقطة بداية مختارة: «جبهة الحفظ» (frontierId) هي
// آخر آية محفوظة، ويتقدّم الوردُ اليومي منها للأمام حسب الخطة. لا قفز بين السور
// — تُكمل من حيث وقفت. مع تقييم ذاتي ومراجعة دورية دوّارة لكلّ المحفوظ.

// وحدة الورد اليومي — آية، ربع وجه، نصف وجه، أو وجه كامل. مرنة «على كيفك».
export type HifzUnit = "ayah" | "quarter" | "half" | "page";

// شدّة التمرين — الإعداد الوحيد في قسم الحفظ. يقود كلَّ الأرقام الداخلية دفعةً
// واحدة (عدد التكرار · نافذة المراجعة القريبة · سقف الأوجه اليومي · سلّم
// المباعدة · عدد مواضع الخطأ المُختبَرة)، فلا مقابض متفرّقة يضبطها المستخدم.
// التفاصيل في src/lib/quran/intensity.ts.
export type HifzIntensity = "light" | "balanced" | "intense";

export interface HifzPlan {
  startId: number; // المعرّف العام لأوّل آية في الخطة (نقطة البداية)
  unit: HifzUnit; // وحدة الورد اليومي
  amount: number; // كم وحدة يومياً (≥ 1)
  createdAt: string; // YYYY-MM-DD
  intensity?: HifzIntensity; // شدّة التمرين (افتراضي "balanced")
}

// تقييم ذاتي للحفظ/المراجعة: 1 يحتاج إتقاناً · 2 جيّد · 3 متقن.
export type HifzRating = 1 | 2 | 3;

export interface HifzSession {
  id: string;
  date: string; // YYYY-MM-DD
  fromId: number; // أوّل آية حُفظت في الجلسة
  toId: number; // آخر آية
  rating?: HifzRating;
  at?: number; // طابع الإنشاء بالمللي‌ثانية — يميّز تقدّم الجلسات عن التصحيح اليدوي، ويرتّب جلستَي اليوم نفسه
  updatedAt?: number; // طابع آخر تعديل (تقييم) — يفوز به التعديل الأحدث في الدمج عبر جهازين
}

export interface HifzReviewLog {
  id: string;
  date: string; // YYYY-MM-DD
  fromId: number;
  toId: number;
  rating?: HifzRating;
  at?: number; // طابع الإنشاء بالمللي‌ثانية — لترتيبٍ موثوقٍ لمراجعتين في اليوم نفسه عبر الأجهزة
  updatedAt?: number; // طابع آخر تعديل (تقييم) — يفوز به التعديل الأحدث في الدمج
}

// خطأ محفوظ في موضعٍ من المصحف — إمّا كلمةٌ بعينها (wordIndex) أو الآية كاملةً
// (wordIndex = null). المفتاح المنطقي هو `ayahId:wordIndex`. طول `hits` هو عدد
// مرّات تكرار الخطأ في هذا الموضع (تاريخٌ لكل مرّة)، فيُعرَف الخطأ المتكرّر.
export interface HifzMistake {
  id: string;
  ayahId: number; // معرّف الآية العام (1..6236)
  wordIndex: number | null; // فهرس الكلمة داخل الآية، أو null للآية كاملة
  word?: string; // نصّ الكلمة (للعرض دون تحميل المصحف)
  hits: string[]; // تواريخ وقوع الخطأ YYYY-MM-DD — طولها = عدد التكرار
  resolved: boolean; // أُتقن (أُغلق)
  updatedAt: string; // YYYY-MM-DD
  // نتيجة الاختبار الصريح على الموضع (المُختبِر يطمس الكلمة ويسألك عنها):
  // عدد النجاحات المتتالية منذ آخر خطأ. يبلغ MISTAKE_MASTERY فيُغلَق الموضع
  // تلقائياً. الخطأ في الاختبار يصفّره ويُضيف ضربةً جديدة.
  okStreak?: number;
  lastDrill?: string; // YYYY-MM-DD آخر يومٍ اختُبِر فيه الموضع (فلا يتكرّر مرّتين في اليوم)
}

export interface HifzState {
  plan: HifzPlan | null;
  frontierId: number; // آخر آية محفوظة (0 = لم يبدأ)
  sessions: HifzSession[]; // سجلّ الحفظ (تتابعي)
  reviews: HifzReviewLog[]; // سجلّ المراجعات (المستحقّة والقريبة والاختبار)
  mistakes?: HifzMistake[]; // مواضع الأخطاء المُحدَّدة أثناء المراجعة
  lastTestDate?: string; // آخر يومٍ ظهر فيه الاختبار العشوائي (لدوريّته)
  // هوية «جيل الخطة»: تتبدّل عند بدء خطة جديدة أو مسحها، فلا تخلط سجلّات خطةٍ
  // قديمة بخطةٍ جديدة، ولا تُعيد نسخةٌ قديمة خطةً مُسِحت. غيابها (بيانات قديمة)
  // يُشتَقّ منه معرّفٌ ثابت عبر legacyHifzGen. راجع mergeHifz في merge.ts.
  planId?: string;
  planUpdatedAt?: number; // طابع بالمللي‌ثانية لآخر تغييرٍ على مستوى الخطة (بدء/مسح/تعديل مقدار)
  frontierUpdatedAt?: number; // طابع بالمللي‌ثانية لآخر تصحيحٍ يدويٍّ للجبهة (setFrontier/بدء الخطة)
  // شواهد حذفٍ داخلية للسجلّات (جلسات/مراجعات/أخطاء): معرّف السجلّ → طابع الحذف
  // (ms). خاصّة بالجيل لأنّها تعيش داخل حالة الحفظ وتُرافقه؛ عند تبدّل الجيل يُؤخذ
  // شواهد الفائز فقط. الحذف يكتبها والتراجع يرفعها، فلا يعيدها اتّحادُ الدمج من
  // جهازٍ قديم لم يرَ الحذف. راجع mergeHifz في merge.ts.
  deletedRecords?: Record<string, number>;
}

export const EMPTY_HIFZ: HifzState = {
  plan: null,
  frontierId: 0,
  sessions: [],
  reviews: [],
  mistakes: [],
};

// حالة الختمة الجارية + عدّاد الختمات المكتملة (يقود «مدار الختمة»).
export interface KhatmaState {
  juz: number; // 0..30 عدد الأجزاء المقروءة في الختمة الحالية (يُضيء الحلقة)
  page?: number; // 0..604 الصفحة التي بلغها (مصدر التقدّم الأدقّ إن وُجد)
  startDate?: string; // YYYY-MM-DD بداية الختمة الحالية
  completed: number; // عدد الختمات المكتملة
  lastReadDate?: string; // YYYY-MM-DD آخر يوم سُجّل فيه جزء
  // سجلّ الصفحة التي بلغها في كلّ يومٍ سُجّل فيه تقدّم — يُحسب منه الوتيرة الأخيرة
  // (آخر 14 ثمّ 30 يوماً) لتقدير الإتمام، بدل الوتيرة منذ البداية. نقطةٌ واحدة
  // لكلّ تاريخ (الأحدث تفوز)، ومحدودٌ بآخر ~45 يوماً فلا ينمو بلا حدّ.
  pageLog?: { date: string; page: number }[];
  // هدف الصفحات اليومي (تفضيلٌ شخصي يبقى عبر الختمات؛ الافتراضي 20 ≈ ختمة في شهر).
  dailyPageGoal?: number;
}

export const EMPTY_KHATMA: KhatmaState = { juz: 0, completed: 0 };

// اسم صندوق الفوائض الذي يستقبل باقي الميزانية اليومية عند نزول الراتب.
export const SURPLUS_FUND_NAME = "الفوائض";

export interface AppData {
  transactions: Transaction[];
  books: Book[];
  readingLogs: ReadingLog[];
  journalEntries: JournalEntry[];
  habits: Habit[];
  recurring: RecurringTransaction[];
  // خطط الأقساط — وصفُ اتفاقٍ فقط؛ المدفوع يُشتَقّ من المعاملات المربوطة بها.
  installmentPlans: InstallmentPlan[];
  // الأصول الغالية وإهلاكها اليومي — عرضٌ محاسبيّ لا يولّد مصروفاً ولا يمسّ رصيداً.
  assets: Asset[];
  budgets: Budget[];
  categories: FinanceCategoryDef[];
  reserves: ReserveFund[];
  prayerLogs: PrayerLog[];
  // القرآن: تأمّلات ومحفوظات (مفاتيح id تُختم عند الحذف)، أيام الوِرد اليومي
  // (تُوحَّد كسجلّات العادات)، وحالة الختمة (مفردة، الأحدث يفوز).
  quranReflections: QuranReflection[];
  quranHifz: HifzState; // خطة الحفظ المتتابعة (بديلة عن قائمة المحفوظات القديمة)
  quranWird: string[]; // dates YYYY-MM-DD أُتمّ فيها الوِرد اليومي
  quranKhatma: KhatmaState;
  dailyBudget: DailyBudget | null;
  monthlyIncome: number | null; // shared by %-based budgets and the daily budget editor
  futureLetters: FutureLetter[];
  // الأحداث المهمّة بعدّها التنازلي (اختبار، ولادة، سفر) — عناصر بمعرّفات
  // وأختام تعديل، كبقيّة المجموعات. اختياريّ فبياناتٌ قديمة بلا الحقل تعمل.
  countdownEvents?: CountdownEvent[];
  salaryDay: number; // يوم نزول الراتب (افتراضياً 27) — يظهر بعده سؤال «نزل الراتب؟»
  // نافذة حساب سقوف التصنيفات: «دورة الراتب» (الافتراضي — تتصفّر عند تأكيد
  // «نزل الراتب») أو «الشهر الميلادي» (من أوّل الشهر إلى آخره). إعدادٌ مفرد
  // يختاره المالك من صفحة الإعدادات؛ غيابه في بياناتٍ قديمة = دورة الراتب.
  budgetWindow?: BudgetWindowMode;
  lastSalaryConfirm: string | null; // YYYY-MM-DD لآخر تأكيد «نزل الراتب»
  readingGoal: number | null; // هدف عدد الكتب المُنهاة هذا العام (null = بلا هدف)
  // العادات المجمّدة مؤقتاً — مفاتيح للبطاقات الموقوفة في «عاداتي اليوم»: مفتاح
  // العادة المخصّصة هو معرّفها (id)، والعادات الأساسية بمفاتيح ثابتة
  // ("core:journal" · "core:reading" · "core:hifz" · "core:wird"). البطاقة
  // المجمّدة تختفي من قائمة اليوم ولا تُحتسب ولا تكسر السلسلة، وتُستأنف متى شئت.
  frozenHabits?: string[];
  // Learned merchant → category id map. When you categorize an expense by
  // hand, the merchant (from the note) is remembered so the next one from the
  // same place is auto-classified your way — this is what makes it تلقائي.
  merchantRules: Record<string, string>;
  // Tombstones: id → deletedAt (ms). A deleted item is recorded here so the
  // multi-device union-merge can't resurrect it from a device that still holds
  // a copy. Pruned after a wide window so the map can't grow forever.
  deleted?: Record<string, number>;
  // Media tombstones: content-hash → deletedAt (ms). When a single photo/voice
  // note is removed from an entry (the rest kept), its hash is recorded here so
  // the media-ref union in mergeEntryMedia can't pull the deleted one back from
  // a device/cloud copy that still references it. Pruned on the same window.
  deletedMedia?: Record<string, number>;
  // Per-field edit stamps for the single-value settings (dailyBudget,
  // monthlyIncome, readingGoal, salaryDay, lastSalaryConfirm, frozenHabits):
  // field name → last-set ms. The merge picks each setting from whichever
  // device set it more recently, so CLEARING a value (to null) propagates
  // instead of being overridden by the other device's stale non-null copy.
  // Absent for legacy data → the merge falls back to the old non-null pick.
  fieldUpdatedAt?: Record<string, number>;
  lastUpdated: string;
}
