"use client";
/**
 * **الرفّ — شراءٌ يَنضج.**
 *
 * ما تشتهيه يُوضع هنا مدّةً تختارها قبل الحكم. زرُّ الشراء **معطَّلٌ حتى تتمّ
 * المدّة** — وهو كلُّ ما تفعله هذه الميزة: لا تمنعك، تؤخّر الحكمَ حتى تهدأ
 * الشهوة ثمّ تسألك وأنت صاحٍ.
 *
 * «دَعْه» لا يحذف العنصر: يبقى محفوظاً ليُجمع ثمنُه في **ما وفَّرت** — وذلك
 * الرقمُ هو ما يقنعك بالتأجيل في المرّة القادمة.
 *
 * و**التصحيحُ ليس نقضاً للصبر**: سعرٌ كُتب خطأً أو اسمٌ فيه سقطة يُعدَّلان،
 * وشيءٌ وُضع سهواً يُحذف — بلا أن يمسّ ذلك تاريخَ الوضع. تصفيرُ العدّاد بابُه
 * الصريحُ الوحيد «ثلاثون أخرى»، فلا يُصفَّر بتغيير حرف.
 */
import { useState } from "react";
import type { ShelfItem } from "@/lib/types";
import {
  shelfAge, isRipe, waitingItems, savedTotal, waitingTotal, ripenTicks, shelfState, arDays,
  ripenDaysOf, SHELF_RIPEN_DAYS, SHELF_RIPEN_CHOICES,
} from "@/lib/shelf";
import { formatAmount } from "@/lib/utils";
import { arNum } from "@/lib/madar/format";
import { SectionHead, HeadMeta, MdrButton } from "../primitives";

/** مسوّدةُ عنصرٍ على الرفّ — تُستعمل للإضافة وللتعديل بالشكل نفسه. */
export interface ShelfDraft {
  name: string;
  price: number;
  reason?: string;
  ripenDays: number;
}

const field: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", background: "transparent",
  border: "none", borderBottom: "1px solid var(--line)", minHeight: 44,
  fontSize: 14.5, padding: "8px 0", fontFamily: "inherit",
  color: "var(--ink)", outline: "none",
};

/**
 * نموذجٌ واحد للإضافة والتعديل — فلا يتباعد الحقلان بمرور الوقت.
 * `initial` غيابُه يعني إضافةً جديدة.
 */
function ShelfDraftForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: ShelfItem;
  submitLabel: string;
  onSubmit: (draft: ShelfDraft) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [price, setPrice] = useState(initial ? String(initial.price) : "");
  const [reason, setReason] = useState(initial?.reason ?? "");
  const [ripenDays, setRipenDays] = useState(initial ? ripenDaysOf(initial) : SHELF_RIPEN_DAYS);

  const priceValue = Number(price);
  const valid = name.trim().length > 0 && Number.isFinite(priceValue) && priceValue > 0;

  return (
    <div style={{ marginTop: 16, border: "1px solid var(--gline)", borderRadius: 18, background: "var(--paper2)", padding: 15 }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ما الذي تشتهيه؟" lang="ar" dir="rtl" style={field} />
      <input
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        placeholder="ثمنُه"
        inputMode="decimal"
        style={{ ...field, marginTop: 12 }}
      />
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="لماذا تريده؟ (السببُ نصفُ الحكم)"
        lang="ar"
        dir="rtl"
        style={{ ...field, marginTop: 12 }}
      />

      <p style={{ margin: "14px 0 7px", fontSize: 10.5, letterSpacing: ".08em", fontWeight: 800, color: "var(--ink52)" }}>
        مدّةُ النضوج
      </p>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }} role="group" aria-label="مدّة النضوج">
        {SHELF_RIPEN_CHOICES.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setRipenDays(d)}
            aria-pressed={ripenDays === d}
            style={{
              flex: "none", minHeight: 36, padding: "0 14px", borderRadius: 999,
              fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              background: ripenDays === d ? "var(--ink)" : "transparent",
              color: ripenDays === d ? "var(--paper)" : "var(--ink52)",
              border: `1px solid ${ripenDays === d ? "var(--ink)" : "var(--line)"}`,
            }}
          >
            {arDays(d)}
          </button>
        ))}
      </div>
      {/* التعديل لا يعيد العدّ — تصريحٌ مكتوب حتى لا يُظنّ أنّ تغيير المدّة
          يبدأ من جديد. المدّةُ تُقاس من تاريخ الوضع كما كان. */}
      {initial && (
        <p style={{ margin: "9px 0 0", fontSize: 11, color: "var(--ink34)", lineHeight: 1.7 }}>
          التعديلُ لا يعيد عدّ الأيام — يبقى محسوباً من يوم وضعتَه. لإعادة العدّ استعمل «ثلاثون أخرى» بعد النضوج.
        </p>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <MdrButton
          kind="ink"
          onClick={() => {
            if (!valid) return;
            onSubmit({ name: name.trim(), price: priceValue, reason: reason.trim() || undefined, ripenDays });
          }}
          disabled={!valid}
        >
          {submitLabel}
        </MdrButton>
        <MdrButton kind="ghost" onClick={onCancel}>إلغاء</MdrButton>
      </div>
    </div>
  );
}

export function Shelf({
  items,
  todayStr,
  onAdd,
  onEdit,
  onDelete,
  onRelease,
  onRenew,
  onBuy,
}: {
  items: ShelfItem[];
  todayStr: string;
  onAdd: (draft: ShelfDraft) => void;
  onEdit: (id: string, draft: ShelfDraft) => void;
  onDelete: (item: ShelfItem) => void;
  onRelease: (id: string) => void;
  onRenew: (id: string) => void;
  onBuy: (item: ShelfItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const waiting = waitingItems(items);
  const saved = savedTotal(items);
  const pending = waitingTotal(items);

  return (
    <div>
      <SectionHead
        title="الرفُّ — شراءٌ يَنضج"
        trailing={<HeadMeta>{arNum(waiting.length)} ينتظر</HeadMeta>}
        marginTop={26}
        marginBottom={10}
      />

      <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink52)", lineHeight: 1.8 }}>
        ما تريد شراءه يُوضَع مدّةً تختارها قبل أن تحكم — والرغبةُ التي لا تصبر
        ثلاثين يومًا لم تكن حاجة.
      </p>

      <div
        style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1,
          background: "var(--line)", margin: "14px 0 0", border: "1px solid var(--line)",
        }}
      >
        <div style={{ background: "var(--paper)", padding: "12px 8px", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 10.5, letterSpacing: ".08em", fontWeight: 700, color: "var(--ink52)" }}>
            تركتَه فوفَّرتَه
          </p>
          <p style={{ margin: "6px 0 0", fontSize: 15, fontWeight: 900, color: "var(--green)" }}>
            {formatAmount(saved)}
          </p>
        </div>
        <div style={{ background: "var(--paper)", padding: "12px 8px", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 10.5, letterSpacing: ".08em", fontWeight: 700, color: "var(--ink52)" }}>
            ينتظر على الرفّ
          </p>
          <p style={{ margin: "6px 0 0", fontSize: 15, fontWeight: 900 }}>{formatAmount(pending)}</p>
        </div>
      </div>

      {waiting.map((k) => {
        const ripe = isRipe(k, todayStr);
        const ticks = ripenTicks(k, todayStr);
        if (editingId === k.id) {
          return (
            <div key={k.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 4 }}>
              <ShelfDraftForm
                initial={k}
                submitLabel="احفظ التعديل"
                onSubmit={(draft) => { onEdit(k.id, draft); setEditingId(null); }}
                onCancel={() => setEditingId(null)}
              />
            </div>
          );
        }
        return (
          <div key={k.id} style={{ borderTop: "1px solid var(--line)", padding: "15px 0" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700 }}>{k.name}</span>
              <span style={{ fontSize: 15, fontWeight: 900 }}>{formatAmount(k.price)}</span>
            </div>

            <p style={{ margin: "5px 0 0", fontSize: 11.5, color: "var(--ink52)", lineHeight: 1.75 }}>
              {k.reason ? `«${k.reason}»` : "بلا سببٍ مكتوب — والسببُ نصفُ الحكم"}
            </p>

            <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 10, margin: "11px 0 0" }}>
              {ticks.map((t, i) => (
                <span
                  key={i}
                  style={{
                    flex: 1,
                    height: t.filled ? 10 : 4,
                    background: t.filled ? (ripe ? "var(--green)" : "var(--gold)") : "var(--line)",
                  }}
                />
              ))}
            </div>

            <p style={{ margin: "7px 0 0", fontSize: 11.5, fontWeight: 700, color: ripe ? "var(--green)" : "var(--ink52)" }}>
              {ripe ? shelfState(k, todayStr) : `مضى ${arDays(shelfAge(k, todayStr))} من ${arDays(ripenDaysOf(k))} · ${shelfState(k, todayStr)}`}
            </p>

            <div style={{ display: "flex", gap: 8, margin: "11px 0 0", flexWrap: "wrap" }}>
              <MdrButton
                kind={ripe ? "ink" : "ghost"}
                onClick={() => onBuy(k)}
                disabled={!ripe}
                grow
                style={{ minWidth: 120 }}
              >
                {ripe ? "اشترِه — سجِّله عملية" : "انتظِر النضوج"}
              </MdrButton>
              <MdrButton kind="ghost" onClick={() => onRelease(k.id)} grow style={{ minWidth: 110, fontSize: 12.5 }}>
                دَعْه واحفظ ثمنَه
              </MdrButton>
              {ripe && (
                <MdrButton kind="gold" onClick={() => onRenew(k.id)} style={{ fontSize: 12.5, padding: "0 14px" }}>
                  ثلاثون أخرى
                </MdrButton>
              )}
            </div>

            {/* تصحيحٌ وحذف — سطرٌ ثانويّ هادئ لا ينافس أزرارَ الحكم أعلاه:
                هذان تصحيحُ خطأٍ في الإدخال، لا قرارَ شراءٍ ولا ترك. */}
            <div style={{ display: "flex", gap: 14, margin: "10px 0 0" }}>
              <button
                type="button"
                onClick={() => { setOpen(false); setEditingId(k.id); }}
                style={{
                  background: "none", border: "none", padding: 0, cursor: "pointer",
                  fontFamily: "inherit", fontSize: 11.5, fontWeight: 700, color: "var(--ink52)",
                  textDecoration: "underline", textUnderlineOffset: 3,
                }}
              >
                تعديل
              </button>
              <button
                type="button"
                onClick={() => onDelete(k)}
                style={{
                  background: "none", border: "none", padding: 0, cursor: "pointer",
                  fontFamily: "inherit", fontSize: 11.5, fontWeight: 700, color: "var(--clay)",
                  textDecoration: "underline", textUnderlineOffset: 3,
                }}
              >
                حذف
              </button>
            </div>
          </div>
        );
      })}

      {waiting.length === 0 && (
        <p style={{ margin: "14px 0 0", fontSize: 13, color: "var(--ink34)" }}>لا شيءَ على الرفِّ الآن.</p>
      )}

      {open ? (
        <ShelfDraftForm
          submitLabel="ضَعْه على الرفّ"
          onSubmit={(draft) => { onAdd(draft); setOpen(false); }}
          onCancel={() => setOpen(false)}
        />
      ) : (
        <MdrButton kind="gold" onClick={() => { setEditingId(null); setOpen(true); }} style={{ marginTop: 16 }}>
          ضَعْ شيئًا على الرفّ
        </MdrButton>
      )}
    </div>
  );
}
