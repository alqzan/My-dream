"use client";
import type { CycleOpening as Opening } from "@/lib/cycleOpening";
import { formatAmount, arabicCount } from "@/lib/utils";

// ===================== بيانُ الدورة =====================
// يُقرأ **سطراً بعد سطر كالجملة** لا شبكةَ أرقام: راتبُك ← ما يخرج منه التزاماً
// ← ما يبقى لك ← ومصروفُك اليومي بعد كلّ ذلك. ولهذا الالتزاماتُ مُزاحةٌ تحت
// الراتب بخطٍّ رفيع، والباقي فوق فاصلٍ كفاصل الجمع في الورق — شكلُ الحساب
// اليدويّ الذي يعرفه المالك، لا بطاقاتٌ متجاورة تُقرأ بأيّ ترتيب.
//
// والأرقامُ كلُّها هندية عبر `formatAmount`/`arabicCount` (قرار المالك ٠٫١٫٣٥٨).
// ولا حساب هنا: كلُّ رقمٍ من `cycleOpening` (نقيّ ومختبَر).

function Row({ label, value, sub, strong, tone }: {
  label: string;
  value: string;
  sub?: string;
  strong?: boolean;
  tone?: "warn";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <div className="min-w-0">
        <span className={strong ? "text-[0.8rem] font-bold" : "text-[0.74rem]"} style={{ color: strong ? "var(--ink)" : "var(--ink52)" }}>
          {label}
        </span>
        {sub && <span className="block text-[0.62rem] leading-relaxed" style={{ color: "var(--ink52)" }}>{sub}</span>}
      </div>
      <span
        className={`shrink-0 tabular-nums ${strong ? "text-[1.05rem] font-extrabold" : "text-[0.82rem] font-semibold"}`}
        style={{ color: tone === "warn" ? "#c15a34" : "var(--ink)" }}
      >
        {value}
      </span>
    </div>
  );
}

export function CycleOpening({ opening, title = "افتتاحية الدورة" }: { opening: Opening; title?: string }) {
  const o = opening;
  const days = arabicCount(o.cycleLen, { one: "يومٌ واحد", two: "يومان", few: "أيام", many: "يوماً" });

  return (
    <div className="mdr-opening">
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="mdr-finance-eyebrow">{title}</span>
        <span className="text-[0.62rem]" style={{ color: "var(--ink52)" }}>{days}</span>
      </div>

      {/* الراتبُ والتزاماتُه — وبلا راتبٍ معروف نبدأ من الالتزامات مباشرةً
          فلا نخترع رقماً ولا نطالبه بإدخاله لنعرض له شيئاً. */}
      {o.income !== null ? (
        <Row label="راتبك" value={`${formatAmount(o.income)} ر.س`} strong />
      ) : (
        o.commitments.length > 0 && <Row label="يخرج من راتبك هذه الدورة" value={`${formatAmount(o.fromSalary)} ر.س`} strong />
      )}

      {o.commitments.length > 0 && (
        <div className="mdr-opening-items">
          {o.commitments.map((c) => (
            <div key={c.fundId} className="flex items-baseline justify-between gap-2 py-0.5">
              <span className="text-[0.7rem] truncate min-w-0" style={{ color: "var(--ink52)" }}>
                <span className="mdr-dot inline-block ms-0 me-1.5" style={{ backgroundColor: c.color }} />
                {c.icon} {c.name}
                {c.source === "surplus" && <span className="mdr-opening-tag">من فوائضك</span>}
              </span>
              {/* `dir="ltr"` على المبلغ وحده: بدونه تجلس إشارةُ الطرح بعد الرقم
                  في السياق العربي فتُقرأ «٢٬٠٠٠−» — والأرقام تبقى هندية. */}
              <span dir="ltr" className="shrink-0 text-[0.72rem] font-semibold tabular-nums" style={{ color: "var(--ink52)" }}>
                −{formatAmount(c.amount)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* بلا التزامٍ واحد يكون «يبقى لك» هو الراتبُ نفسه — سطرٌ يعيد السطر الذي
          فوقه بلا معنى، فيُطوى. */}
      {o.income !== null && o.commitments.length > 0 && (
        <>
          <div className="mdr-opening-rule" />
          <Row label="يبقى لك" value={`${formatAmount(o.yours ?? 0)} ر.س`} strong />
        </>
      )}

      <div className="mdr-opening-rule" />
      <Row
        label="مصروفك اليومي"
        value={`${formatAmount(Math.round(o.rate))} ر.س`}
        strong
        sub={o.perDay > 0 ? `${formatAmount(Math.round(o.setRate))} مضبوط − ${formatAmount(Math.round(o.perDay))} تنزل لمظاريفك كلَّ يوم` : undefined}
      />

      {/* **الرقمُ الذي لم يكن يُعرض**: وتيرتُك مقابلَ ما يبقى لك فعلاً. يُقال في
          أوّل الدورة قراراً، لا في آخرها عجزاً. والحكمُ من `verdict` (يوميّةٌ
          واحدة خطّاً فاصلاً) لا من إشارة الفجوة: عشرةُ ريالاتٍ على دورةٍ كاملة
          لو صُبغت بالأحمر لعلّمته تجاهلَ اللون. */}
      {o.verdict === "over" && (
        <div className="mdr-opening-note is-warn">
          بهذه الوتيرة تخطّط لصرف <b>{formatAmount(o.planned)}</b> ولا يبقى لك إلّا{" "}
          <b>{formatAmount(o.yours ?? 0)}</b> — أنت فوق ما تملك بـ<b>{formatAmount(Math.abs(o.gap ?? 0))} ر.س</b>.
          اخفض مصروفك اليومي أو أجّل التزاماً.
        </div>
      )}
      {o.verdict === "fits" && (
        <div className="mdr-opening-note">
          بهذه الوتيرة تصرف <b>{formatAmount(o.planned)}</b> ويتبقّى من راتبك{" "}
          <b>{formatAmount(o.gap ?? 0)} ر.س</b> في نهاية الدورة.
        </div>
      )}
      {o.verdict === "onTrack" && (
        <div className="mdr-opening-note">
          وتيرتُك على قدر راتبك تماماً — تصل يوم الراتب القادم على الصفر تقريباً.
        </div>
      )}

      {o.carryIn > 0 && (
        <p className="text-[0.62rem] mt-1.5" style={{ color: "var(--ink52)" }}>
          ويُرحَّل فائض دورتك المنتهية (<b>{formatAmount(o.carryIn)} ر.س</b>) إلى فوائضك.
        </p>
      )}
    </div>
  );
}
