/**
 * **حارسُ الوصول — لا تموت ميزةٌ في صمت.**
 *
 * أكبرُ عطبٍ أصاب هذا التطبيق لم يكن خطأً في حساب، بل **ميزاتٍ كاملةً فقدت
 * مدخلَها**: نقلُ تصميم «مدار» فصل مكوّناتٍ حيّةً عن شاشاتها ولم يحذفها، فبقيت
 * الشيفرةُ والبياناتُ والاختباراتُ سليمةً و«إضافةُ عادة» و«تعليمُ الوِرد»
 * و«تتبّعُ الختمة» لا زرَّ يبلغها. لا اختبارٌ يفشل حين يحدث ذلك: كلُّ اختبارٍ
 * يسأل «هل يعمل؟» ولا أحد يسأل **«هل يُستطاع؟»**.
 *
 * فهذان فحصان:
 *
 * ١. كلُّ مكوّنٍ في `src/components` يستورده أحدٌ ما (بابٌ أو مكوّنٌ موصول).
 * ٢. كلُّ إجراءٍ في المتجر (`store.ts`) تناديه الواجهة.
 *
 * وما يُترك عمداً يُكتب في `PARKED_*` أدناه **باسمه وسببه**. القائمةُ نفسها
 * هي الفائدة: قرارٌ مكتوبٌ يُراجَع، بدل ميزةٍ نُسيت.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("..", import.meta.url)); // …/src

/**
 * مكوّناتٌ **موقوفةٌ عن قصد** — بُنيت وتُركت خارج الشاشات بانتظار قرار.
 *
 * ليست شيفرةً ميتةً منسيّة: كلُّ سطرٍ هنا اعترافٌ صريح. وإخراجُ اسمٍ من هذه
 * القائمة يعني أحدَ أمرين لا ثالثَ لهما — أن يُوصل بشاشة، أو أن يُحذف.
 */
const PARKED_COMPONENTS: Record<string, string> = {
  // قسمُ القرآن معروضٌ الآن كمسارِ حفظٍ فقط (انظر تعليق `src/app/quran/page.tsx`).
  "TadabburSection.tsx": "التدبّر — بياناته محفوظة، والعرض مؤجّل بقرار",
  "MushafBrowser.tsx": "تصفّحُ المصحف — مؤجّل مع التدبّر",
  "PageReader.tsx": "قارئُ الصفحة — لا يبلغه إلا MushafBrowser الموقوف",
  "HifzReminder.tsx": "تذكيرُ الحفظ — مؤجّل",
  "AyahPicker.tsx": "منتقي الآية — لا يبلغه إلا TadabburSection الموقوف",
  // بقايا نقلِ التصميم: بدائلُ حيّة تعمل مكانها.
  "DailyHabits.tsx": "بطاقةُ العادات القديمة — بديلُها الحيّ DayDigestCard",
  "MemoryDome.tsx": "قبّةُ الذكريات — أُعيدت MemorySky مكانها (انظر ROADMAP)",
  "FinanceGlance.tsx": "لمحةُ المال — بديلُها FinanceCycleDashboard",
  "PrayerOrbit.tsx": "مدارُ الصلاة — بديلُه PrayerScreen",
  "HikmaCard.tsx": "بطاقةُ الحكمة — بديلُها QuranBanner",
  "WeeklyWrap.tsx": "الملخّصُ الأسبوعي — بديلُه WeeklySummary",
  "InstallHint.tsx": "تلميحُ التثبيت — مؤجّل",
  "CycleCurve.tsx": "منحنى الدورة (نسخةُ mal) — بديلُه الحيّ FinanceCycleDashboard",
  // ⚠️ هذه وحدها ليست بديلاً مكرّراً بل **ميزةٌ فقدت مدخلها**: لا سبيل الآن
  // لتتبّع الختمة (جزءاً أو صفحة) — كانت داخل MushafBrowser الموقوف.
  "KhatmaOrbit.tsx": "مدارُ الختمة — لا يبلغه إلا MushafBrowser الموقوف (ميزةٌ بلا مدخل، تنتظر قرار العرض)",
};

/**
 * إجراءاتُ متجرٍ لا تناديها الواجهة **عن قصد**.
 *
 * أكثرُها تابعٌ لمكوّنٍ موقوفٍ أعلاه؛ وما ليس كذلك فسببُه مكتوب.
 */
const PARKED_ACTIONS: Record<string, string> = {
  addReflection: "تابعٌ للتدبّر الموقوف",
  updateReflection: "تابعٌ للتدبّر الموقوف",
  deleteReflection: "تابعٌ للتدبّر الموقوف",
  reopenMistake: "إعادةُ فتح خطأٍ — لا مدخلَ لها في لوحة الأخطاء بعد",
  addKnowledgeSource: "المحبرة: المصادر والفوائد — بُنيت ولم تُعرض بعد",
  updateKnowledgeSource: "المحبرة: المصادر والفوائد — بُنيت ولم تُعرض بعد",
  deleteKnowledgeSource: "المحبرة: المصادر والفوائد — بُنيت ولم تُعرض بعد",
  addBenefit: "المحبرة: المصادر والفوائد — بُنيت ولم تُعرض بعد",
  updateBenefit: "المحبرة: المصادر والفوائد — بُنيت ولم تُعرض بعد",
  deleteBenefit: "المحبرة: المصادر والفوائد — بُنيت ولم تُعرض بعد",
  autoLinkTransaction: "يُنادى من داخل المتجر نفسه (ربطُ دفعةِ قسطٍ تلقائياً)",
  // ⚠️ الختمةُ كلُّها بلا مدخل — تابعةٌ لـKhatmaOrbit الموقوف. ليست قراراً
  // قديماً بل أثرٌ جانبيّ لنقل التصميم؛ إعادتُها بانتظار قرار العرض.
  addKhatmaJuz: "الختمة — تابعةٌ لـKhatmaOrbit الموقوف",
  setKhatmaJuz: "الختمة — تابعةٌ لـKhatmaOrbit الموقوف",
  setKhatmaPage: "الختمة — تابعةٌ لـKhatmaOrbit الموقوف",
  setKhatmaPageGoal: "الختمة — تابعةٌ لـKhatmaOrbit الموقوف",
  completeKhatma: "الختمة — تابعةٌ لـKhatmaOrbit الموقوف",
  resetKhatma: "الختمة — تابعةٌ لـKhatmaOrbit الموقوف",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const ALL_FILES = walk(SRC).filter((f) => [".ts", ".tsx"].includes(extname(f)));
const isTest = (f: string) => /\.test\.tsx?$/.test(f);
const isParked = (f: string) => basename(f) in PARKED_COMPONENTS;

/** كلُّ ما يُعتدّ به مصدرَ وصلٍ: شيفرةٌ حيّة، لا اختبارٌ ولا ملفٌّ موقوف. */
const LIVE_SOURCES = ALL_FILES.filter((f) => !isTest(f) && !isParked(f));
const LIVE_TEXT = LIVE_SOURCES.map((f) => ({ file: f, text: readFileSync(f, "utf8") }));

describe("حارسُ الوصول — كلُّ مكوّنٍ له مدخل", () => {
  const components = ALL_FILES.filter(
    (f) => f.includes(`${"components"}${"/"}`) && extname(f) === ".tsx" && !isTest(f)
  );

  it("يجد مكوّناتٍ ليفحصها (حارسٌ للحارس)", () => {
    expect(components.length).toBeGreaterThan(100);
  });

  it("لا مكوّنَ حيٌّ بلا مستوردٍ حيّ", () => {
    const orphans: string[] = [];
    for (const file of components) {
      if (isParked(file)) continue;
      const name = basename(file, ".tsx");
      // الاستيرادُ في هذا المشروع دائماً بالمسار المنتهي باسم الملف
      // (`@/components/…/Name` أو `./Name`), فالبحثُ عن الاسم مسبوقاً بشرطة
      // مائلة ومتبوعاً بعلامة اقتباسٍ يكفي ولا يلتقط ذكراً في تعليق.
      const needle = new RegExp(`/${name}["']`);
      const imported = LIVE_TEXT.some((s) => s.file !== file && needle.test(s.text));
      if (!imported) orphans.push(relative(SRC, file));
    }
    expect(
      orphans,
      "مكوّنٌ لا تستورده أيُّ شاشة = ميزةٌ لا يبلغها المستخدم. " +
        "صِلْه بشاشة، أو احذفه، أو سجّله في PARKED_COMPONENTS بسببه."
    ).toEqual([]);
  });

  it("لا اسمَ في PARKED_COMPONENTS بلا ملفّ (القائمةُ لا تتعفّن)", () => {
    const present = new Set(ALL_FILES.map((f) => basename(f)));
    const stale = Object.keys(PARKED_COMPONENTS).filter((n) => !present.has(n));
    expect(stale, "أسماءٌ موقوفةٌ لملفّاتٍ لم تعد موجودة — احذفها من القائمة").toEqual([]);
  });
});

describe("حارسُ الوصول — كلُّ إجراءٍ في المتجر تناديه الواجهة", () => {
  const storeText = readFileSync(join(SRC, "lib", "store.ts"), "utf8");

  /** أسماءُ الإجراءات من واجهة `AppStore` — كلُّ حقلٍ نوعُه دالّة. */
  const actions = (() => {
    const start = storeText.indexOf("interface AppStore extends AppData {");
    expect(start).toBeGreaterThan(-1);
    const block = storeText.slice(start, storeText.indexOf("\n}", start));
    const names = new Set<string>();
    for (const line of block.split("\n")) {
      const m = /^ {2}([a-zA-Z][a-zA-Z0-9]*)(\?)?:\s*\(/.exec(line);
      if (m) names.add(m[1]);
    }
    return [...names];
  })();

  const uiText = LIVE_TEXT.filter(
    (s) => s.file.includes(`${"app"}${"/"}`) || s.file.includes(`${"components"}${"/"}`)
  );

  it("يستخرج إجراءاتٍ ليفحصها (حارسٌ للحارس)", () => {
    expect(actions.length).toBeGreaterThan(60);
    expect(actions).toContain("addHabit");
    expect(actions).toContain("toggleWird");
  });

  it("لا إجراءَ حيٌّ بلا مُنادٍ في الواجهة", () => {
    const unreachable: string[] = [];
    for (const action of actions) {
      if (action in PARKED_ACTIONS) continue;
      const needle = new RegExp(`\\b${action}\\b`);
      if (!uiText.some((s) => needle.test(s.text))) unreachable.push(action);
    }
    expect(
      unreachable,
      "إجراءٌ في المتجر لا تبلغه الواجهة = قدرةٌ يملكها التطبيق ولا يستطيعها المالك. " +
        "صِلْه بزرّ، أو احذفه، أو سجّله في PARKED_ACTIONS بسببه."
    ).toEqual([]);
  });

  it("لا اسمَ في PARKED_ACTIONS بلا إجراءٍ (القائمةُ لا تتعفّن)", () => {
    const known = new Set(actions);
    const stale = Object.keys(PARKED_ACTIONS).filter((n) => !known.has(n));
    expect(stale, "إجراءاتٌ موقوفةٌ لم تعد في المتجر — احذفها من القائمة").toEqual([]);
  });
});
