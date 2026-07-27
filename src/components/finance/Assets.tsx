"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import type { Asset } from "@/lib/types";
import { ASSET_LIFE_PRESETS } from "@/lib/types";
import {
  assetStatus, assetsOverview, dailyDepreciation, describeDays, validateAssetDraft,
  depreciationInMonth, MAX_LIFE_DAYS,
} from "@/lib/assets";
import { uid, today, formatAmount, formatDateShort, cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { NumberInput } from "@/components/ui/NumberInput";
import { showUndo } from "@/components/ui/UndoToast";
import { Plus, Trash2, X, Pencil, TrendingDown } from "lucide-react";

// «الأصول» — الأشياء الغالية التي تملكها وتخدمك سنين (جوّال، لابتوب، أثاث،
// سيارة). السؤال الذي تجيب عنه هذه الشاشة: *كم يكلّفني هذا الشيء في اليوم فعلاً،
// وكم بقي من قيمته؟*
//
// **لا شيء هنا يمسّ صرفك**: الإهلاك عرضٌ محاسبيّ ولا يولّد معاملةً ولا يدخل
// الميزانية اليومية ولا السقوف. المصروف الحقيقي هو ثمن الشراء (أو أقساطه) حين
// سُجّل — ولا يجوز احتسابه مرّتين. الحساب النقيّ كلّه في src/lib/assets.ts.
export function Assets() {
  const { assets, addAsset, deleteAsset } = useAppStore();
  const list = assets ?? [];
  const todayStr = today();
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const o = assetsOverview(list, todayStr);
  const month = todayStr.slice(0, 7);
  const monthDep = list.reduce((s, a) => s + depreciationInMonth(a, month), 0);

  // ما زال بيدك أولاً (الأحدث شراءً)، والمباع في الذيل.
  const ordered = [...list].sort((a, b) => {
    const soldA = a.soldDate ? 1 : 0;
    const soldB = b.soldDate ? 1 : 0;
    return soldA - soldB || b.purchaseDate.localeCompare(a.purchaseDate);
  });

  function handleDelete(asset: Asset) {
    deleteAsset(asset.id);
    showUndo("حذفت الأصل", () => addAsset(asset));
  }

  return (
    <div className="space-y-3">
      {/* لا عنوان هنا: البطاقة تعيش داخل «الأصول» القابل للطيّ في صفحة الأموال،
          ورأسُه يحمل الاسم والملخّص — تكرارُهما هنا كان يعرض القسم مرّتين. */}
      <div className="flex items-center justify-end">
        <button
          onClick={() => { setAdding((v) => !v); setEditId(null); }}
          className="text-finance hover:text-finance/80 p-1.5 press shrink-0"
          aria-label="إضافة أصل"
        >
          <Plus size={16} />
        </button>
      </div>

      {o.count > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <Stat label="تستهلك يومياً" value={`${formatAmount(o.perDay)} ر.س`} />
          <Stat label="هذا الشهر" value={`${formatAmount(Math.round(monthDep * 100) / 100)} ر.س`} />
          <Stat label="استُهلك منها" value={`${formatAmount(o.consumed)} ر.س`} />
        </div>
      )}
      {o.count > 0 && (
        <p className="text-[10px] text-gray-400 leading-relaxed">
          كلّفتك {formatAmount(o.totalCost)} ر.س وقيمتها الآن {formatAmount(o.bookValue)} ر.س
          {o.expiredCount > 0 ? ` · ${formatAmount(o.expiredCount)} انتهى عمره الافتراضي` : ""}
          {o.soldResult !== 0 ? ` · بيعُ ما بِعت ${o.soldResult > 0 ? "ربح" : "خسارة"} ${formatAmount(Math.abs(o.soldResult))} ر.س` : ""}
          {" "}— الإهلاك حسابٌ للعِلم فقط، لا يُخصم من ميزانيتك.
        </p>
      )}

      {(adding || editId) && (
        <AssetForm
          key={editId ?? "new"}
          initial={editId ? list.find((a) => a.id === editId) : undefined}
          onDone={() => { setAdding(false); setEditId(null); }}
        />
      )}

      {list.length === 0 && !adding && (
        <button
          onClick={() => setAdding(true)}
          className="w-full py-5 rounded-xl border-2 border-dashed border-finance/30 text-finance text-sm font-medium hover:bg-finance/5 press"
        >
          📦 سجّل شيئاً غالياً اشتريتَه — واعرف كم يكلّفك في اليوم
        </button>
      )}

      <div className="space-y-2">
        {ordered.map((a) => (
          <AssetCard
            key={a.id}
            asset={a}
            onEdit={() => { setEditId(a.id); setAdding(false); }}
            onDelete={() => handleDelete(a)}
          />
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 dark:bg-white/5 px-2 py-2 text-center">
      <div className="text-[9px] text-gray-400">{label}</div>
      <div className="text-[12px] font-bold tabular-nums text-gray-800 dark:text-gray-100">{value}</div>
    </div>
  );
}

// ————————————————————————————————————————————————————————————————
function AssetCard({ asset, onEdit, onDelete }: { asset: Asset; onEdit: () => void; onDelete: () => void }) {
  const { installmentPlans, updateAsset } = useAppStore();
  const todayStr = today();
  const s = assetStatus(asset, todayStr);
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sellPrice, setSellPrice] = useState("");
  const plan = asset.planId ? (installmentPlans ?? []).find((p) => p.id === asset.planId) : undefined;

  return (
    <div className={cn(
      "rounded-2xl border p-3 space-y-2",
      s.sold ? "border-gray-100 bg-gray-50 dark:bg-white/5" : "border-gray-100 bg-white"
    )}>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-full text-right press">
        <div className="flex items-start gap-2">
          <span className="text-xl shrink-0">{asset.icon || "📦"}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">{asset.name}</span>
              {s.sold && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600 dark:bg-white/10 dark:text-gray-300 shrink-0">
                  بِعتَه
                </span>
              )}
              {!s.sold && s.expired && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 shrink-0">
                  انتهى عمره
                </span>
              )}
            </div>
            <div className="text-[11px] text-gray-400 truncate mt-0.5">
              اشتريتَه {formatDateShort(asset.purchaseDate)} بـ{formatAmount(asset.purchasePrice)} ر.س
              {plan ? " · بالتقسيط" : ""}
            </div>
            {/* الرقم الذي يهمّ: كم يكلّفك في اليوم */}
            <div className="text-[11px] font-semibold text-finance mt-0.5">
              {s.future
                ? "لم يبدأ عمره بعد"
                : s.expired
                  ? `استهلك قيمته كاملةً خلال ${describeDays(s.lifeDays)}`
                  : `يكلّفك ${formatAmount(s.perDay)} ر.س يومياً · ${formatAmount(s.perMonth)} شهرياً`}
            </div>
          </div>
          <div className="text-left shrink-0">
            <div className="text-sm font-bold tabular-nums text-gray-800 dark:text-gray-100">
              {formatAmount(s.bookValue)}
            </div>
            <div className="text-[10px] text-gray-400">قيمته الآن</div>
          </div>
        </div>

        {/* شريط الاستهلاك — كم أُكِل من قيمته */}
        <div className="h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden mt-2">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${s.pct}%`, backgroundColor: s.pct >= 100 ? "#c9852a" : "#c1663f" }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] text-gray-400 mt-1">
          <span>استُهلك {formatAmount(s.depreciated)} ر.س ({s.pct}٪)</span>
          <span>{s.sold ? `بِعتَه ${formatDateShort(asset.soldDate!)}` : `يبقى ${describeDays(s.remainingDays)}`}</span>
        </div>
      </button>

      {open && (
        <div className="space-y-2 pt-1 border-t border-gray-100 dark:border-white/10 text-[11px] text-gray-500">
          <div className="grid grid-cols-2 gap-1.5">
            <Fact label="العمر الافتراضي" value={describeDays(s.lifeDays)} />
            <Fact label="ينتهي" value={formatDateShort(s.endDate)} />
            <Fact label="ملكتَه" value={describeDays(s.daysOwned) === "انتهى" ? "بدأ اليوم" : describeDays(s.daysOwned)} />
            <Fact label="القيمة المتبقّية" value={`${formatAmount(s.salvage)} ر.س`} />
          </div>
          {plan && (
            <p className="rounded-lg bg-gray-50 dark:bg-white/5 px-2.5 py-2 leading-relaxed">
              🧾 مربوطٌ بخطة أقساط «{plan.name || plan.provider}» — الأقساط هي صرفك الفعليّ، والإهلاك هنا عرضٌ فقط.
            </p>
          )}
          {asset.note && <p>{asset.note}</p>}

          {s.sold ? (
            <p className="text-gray-500">
              بِعتَه بـ{formatAmount(asset.soldPrice ?? 0)} ر.س ·{" "}
              {s.saleResult == null ? "" : s.saleResult >= 0
                ? <span className="text-finance font-semibold">ربحتَ {formatAmount(s.saleResult)} ر.س على قيمته الدفترية</span>
                : <span className="text-red-500 font-semibold">خسرتَ {formatAmount(Math.abs(s.saleResult))} ر.س عن قيمته الدفترية</span>}
            </p>
          ) : (
            <div className="rounded-lg bg-finance/5 p-2 space-y-1.5">
              <div className="text-[10px] font-semibold text-gray-600">بِعتَه؟ اكتب ثمن البيع</div>
              <div className="flex gap-1.5">
                <NumberInput
                  value={sellPrice}
                  onChange={setSellPrice}
                  placeholder={`قيمته الدفترية اليوم ${formatAmount(s.bookValue)}`}
                  inputMode="decimal"
                  className="flex-1 min-w-0 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-finance/40"
                />
                <button
                  onClick={() => {
                    const v = parseFloat(sellPrice);
                    if (!(v >= 0)) return;
                    updateAsset(asset.id, { soldDate: today(), soldPrice: v });
                    setSellPrice("");
                  }}
                  className="text-[11px] font-bold text-white bg-finance rounded-lg px-3 press shrink-0"
                >
                  سجّل البيع
                </button>
              </div>
              <p className="text-[10px] text-gray-400">
                البيع يوقف الإهلاك ويقارن الثمن بقيمته الدفترية — ولا يُنشئ معاملةً (سجّل الوارد بنفسك إن شئت).
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            <button onClick={onEdit} className="flex items-center gap-1 text-[11px] text-gray-500 bg-gray-100 dark:bg-white/10 rounded-lg px-2 py-1 press">
              <Pencil size={11} /> تعديل
            </button>
            {s.sold && (
              <button
                onClick={() => updateAsset(asset.id, { soldDate: undefined, soldPrice: undefined })}
                className="flex items-center gap-1 text-[11px] text-gray-500 bg-gray-100 dark:bg-white/10 rounded-lg px-2 py-1 press"
              >
                تراجع عن البيع
              </button>
            )}
            {confirmDelete ? (
              <span className="flex items-center gap-1.5">
                <button onClick={onDelete} className="text-[11px] font-bold text-white bg-red-500 rounded-lg px-2 py-1 press">أكّد الحذف</button>
                <button onClick={() => setConfirmDelete(false)} className="text-[11px] text-gray-500 bg-gray-100 dark:bg-white/10 rounded-lg px-2 py-1 press">تراجع</button>
              </span>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-red-400 press">
                <Trash2 size={11} /> حذف
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-white/5 px-2 py-1.5">
      <div className="text-[9px] text-gray-400">{label}</div>
      <div className="text-[11px] font-semibold text-gray-700 dark:text-gray-200">{value}</div>
    </div>
  );
}

// ————————————————————————————————————————————————————————————————
// نموذج الأصل: ما هو، بكم، متى، وكم تتوقّع أن يخدمك. العمر «على كيفك» — أزرارٌ
// جاهزة وحقلٌ حرٌّ بالشهور، والاستهلاك اليوميّ يُعرَض حيّاً قبل الحفظ.
function AssetForm({ initial, onDone }: { initial?: Asset; onDone: () => void }) {
  const { addAsset, updateAsset } = useAppStore();
  const [name, setName] = useState(initial?.name ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "");
  const [purchasePrice, setPurchasePrice] = useState(initial?.purchasePrice ? String(initial.purchasePrice) : "");
  const [purchaseDate, setPurchaseDate] = useState(initial?.purchaseDate ?? today());
  const [lifeDays, setLifeDays] = useState(initial?.lifeDays ?? 730);
  const [lifeMonths, setLifeMonths] = useState(initial ? String(Math.round(initial.lifeDays / 30)) : "");
  const [salvage, setSalvage] = useState(initial?.salvageValue ? String(initial.salvageValue) : "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [errors, setErrors] = useState<string[]>([]);

  const num = (v: string) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  const draft: Asset = {
    id: initial?.id ?? "preview",
    name, purchaseDate,
    purchasePrice: num(purchasePrice),
    salvageValue: num(salvage) || undefined,
    lifeDays,
    createdAt: initial?.createdAt ?? today(),
  };
  const perDay = draft.purchasePrice > 0 ? dailyDepreciation(draft) : 0;

  // الشهور حقلٌ حرّ (٪على كيفك٪) والأيام هي وحدة الحساب — نحوّل عند الكتابة.
  function handleMonths(v: string) {
    setLifeMonths(v);
    const m = Math.floor(num(v));
    if (m >= 1) setLifeDays(Math.min(MAX_LIFE_DAYS, m * 30));
  }
  function pickPreset(days: number) {
    setLifeDays(days);
    setLifeMonths("");
  }

  // نواقص المسوّدة **حيّةً** أثناء الكتابة، لا بعد الضغط: زرٌّ يرفض الحفظ صامتاً
  // يبدو معطّلاً لا مانعاً. فالزرّ يُعطَّل ظاهراً ويُكتب سببه تحته.
  const problems = validateAssetDraft({
    name, purchasePrice: draft.purchasePrice, purchaseDate, lifeDays, salvageValue: draft.salvageValue,
  });

  function handleSave() {
    if (problems.length) { setErrors(problems); return; }
    const payload = {
      name: name.trim(),
      icon: icon.trim() || undefined,
      purchasePrice: draft.purchasePrice,
      purchaseDate,
      lifeDays,
      salvageValue: draft.salvageValue,
      note: note.trim() || undefined,
    };
    // أيّ خللٍ في الحفظ يُعرَض نصّاً بدل أن يبتلعه المتصفّح فيبدو الزرّ ميتاً.
    try {
      if (initial) updateAsset(initial.id, payload);
      else addAsset({ ...payload, id: uid(), createdAt: today() });
    } catch (e) {
      setErrors([`تعذّر الحفظ: ${e instanceof Error ? e.message : String(e)}`]);
      return;
    }
    onDone();
  }

  const field = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-finance/40";

  return (
    <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-3 space-y-2.5 animate-fade-up">
      <div className="grid grid-cols-[1fr_3.5rem] gap-2">
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">ما هو؟</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="آيفون، لابتوب، كنب…" className={field} autoFocus />
        </div>
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">رمز</label>
          <input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="📱" className={`${field} text-center px-1`} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">كم كلّفك؟</label>
          <NumberInput value={purchasePrice} onChange={setPurchasePrice} placeholder="الثمن كاملاً" inputMode="decimal" className={field} />
        </div>
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">متى اشتريتَه؟</label>
          {/* قيمةٌ فارغة من منتقي التاريخ (يحدث في Safari حين يكون تقويم الجهاز
              هجرياً) كانت تُبقي الحقل بلا تاريخٍ صالح فيرفض الزرّ الحفظ صامتاً —
              نتمسّك بآخر تاريخٍ صالح بدل أن نمسحه. */}
          <input
            type="date"
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value || purchaseDate)}
            className={field}
          />
        </div>
      </div>

      <div>
        <label className="block text-[10px] text-gray-400 mb-1">كم تتوقّع أن يخدمك؟ (على كيفك)</label>
        <div className="flex gap-1.5 flex-wrap mb-1.5">
          {ASSET_LIFE_PRESETS.map((p) => (
            <button
              key={p.days}
              onClick={() => pickPreset(p.days)}
              className={cn(
                "text-[11px] rounded-full px-2.5 py-1 border press",
                lifeDays === p.days && !lifeMonths ? "border-finance bg-finance/10 text-finance font-bold" : "border-gray-200 text-gray-500"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <NumberInput value={lifeMonths} onChange={handleMonths} placeholder="أو اكتب عدد الشهور" inputMode="numeric" className={field} />
      </div>

      <div>
        <label className="block text-[10px] text-gray-400 mb-1">قيمته المتوقّعة في النهاية (اختياري)</label>
        <NumberInput value={salvage} onChange={setSalvage} placeholder="٠ — يستهلك قيمته كاملةً" inputMode="decimal" className={field} />
      </div>

      {perDay > 0 && (
        <div className="rounded-lg bg-finance/5 border border-finance/20 px-3 py-2 text-[11px] leading-relaxed text-gray-700 dark:text-gray-200">
          <TrendingDown size={12} className="inline-block align-[-1px] ms-0 me-1 text-finance" />
          يكلّفك <strong className="tabular-nums">{formatAmount(perDay)} ر.س</strong> في اليوم
          {" · "}{formatAmount(Math.round(perDay * 30 * 100) / 100)} ر.س شهرياً
          {" · "}على مدى {describeDays(lifeDays)}
        </div>
      )}

      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة (اختياري)" className={field} />

      {errors.length > 0 && (
        <ul className="text-[11px] text-red-500 space-y-0.5">
          {errors.map((e) => <li key={e}>• {e}</li>)}
        </ul>
      )}

      {/* سبب تعطّل الزرّ ظاهرٌ دائماً — فلا يُظنّ ميتاً وهو ممتنع. */}
      {problems.length > 0 && errors.length === 0 && (
        <p className="text-[11px] text-gray-400">لإتمام الحفظ: {problems[0]}</p>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={problems.length > 0}
          className="flex-1 bg-finance hover:bg-finance/90"
        >
          {initial ? "حفظ التعديل" : "أضِف الأصل"}
        </Button>
        <Button size="sm" variant="secondary" onClick={onDone} className="gap-1">
          <X size={14} /> إلغاء
        </Button>
      </div>
    </div>
  );
}
