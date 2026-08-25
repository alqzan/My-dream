"use client";
/**
 * **الرفّ — شراءٌ يَنضج.**
 *
 * ما تشتهيه يُوضع هنا ثلاثين يوماً قبل الحكم. زرُّ الشراء **معطَّلٌ حتى تتمّ
 * المدّة** — وهو كلُّ ما تفعله هذه الميزة: لا تمنعك، تؤخّر الحكمَ حتى تهدأ
 * الشهوة ثمّ تسألك وأنت صاحٍ.
 *
 * «دَعْه» لا يحذف العنصر: يبقى محفوظاً ليُجمع ثمنُه في **ما وفَّرت** — وذلك
 * الرقمُ هو ما يقنعك بالتأجيل في المرّة القادمة.
 */
import { useState } from "react";
import type { ShelfItem } from "@/lib/types";
import {
  shelfAge, isRipe, waitingItems, savedTotal, waitingTotal, ripenTicks, shelfState, arDays,
} from "@/lib/shelf";
import { formatAmount } from "@/lib/utils";
import { arNum } from "@/lib/madar/format";
import { SectionHead, HeadMeta, MdrButton } from "../primitives";

export function Shelf({
  items,
  todayStr,
  onAdd,
  onRelease,
  onRenew,
  onBuy,
}: {
  items: ShelfItem[];
  todayStr: string;
  onAdd: (draft: { name: string; price: number; reason?: string }) => void;
  onRelease: (id: string) => void;
  onRenew: (id: string) => void;
  onBuy: (item: ShelfItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [reason, setReason] = useState("");

  const waiting = waitingItems(items);
  const saved = savedTotal(items);
  const pending = waitingTotal(items);

  const field: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", background: "transparent",
    border: "none", borderBottom: "1px solid var(--line)", minHeight: 44,
    fontSize: 14.5, padding: "8px 0", fontFamily: "inherit",
    color: "var(--ink)", outline: "none",
  };

  const submit = () => {
    const n = name.trim();
    const p = Number(price);
    if (!n || !Number.isFinite(p) || p <= 0) return;
    onAdd({ name: n, price: p, reason: reason.trim() || undefined });
    setName(""); setPrice(""); setReason(""); setOpen(false);
  };

  return (
    <div>
      <SectionHead
        title="الرفُّ — شراءٌ يَنضج"
        trailing={<HeadMeta>{arNum(waiting.length)} ينتظر</HeadMeta>}
        marginTop={26}
        marginBottom={10}
      />

      <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink52)", lineHeight: 1.8 }}>
        ما تريد شراءه يُوضَع ثلاثين يومًا قبل أن تحكم — والرغبةُ التي لا تصبر ثلاثين
        يومًا لم تكن حاجة.
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
              {ripe ? shelfState(k, todayStr) : `مضى ${arDays(shelfAge(k, todayStr))} · ${shelfState(k, todayStr)}`}
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
          </div>
        );
      })}

      {waiting.length === 0 && (
        <p style={{ margin: "14px 0 0", fontSize: 13, color: "var(--ink34)" }}>لا شيءَ على الرفِّ الآن.</p>
      )}

      {open ? (
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
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <MdrButton kind="ink" onClick={submit} disabled={!name.trim() || !(Number(price) > 0)}>
              ضَعْه على الرفّ
            </MdrButton>
            <MdrButton kind="ghost" onClick={() => setOpen(false)}>إلغاء</MdrButton>
          </div>
        </div>
      ) : (
        <MdrButton kind="gold" onClick={() => setOpen(true)} style={{ marginTop: 16 }}>
          ضَعْ شيئًا على الرفّ
        </MdrButton>
      )}
    </div>
  );
}
