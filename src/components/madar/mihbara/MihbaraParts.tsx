"use client";
/**
 * قِطعُ المحبرة: درجاتُ المسار · ملتقِطُ الفائدة · المصادر · الفوائد · مقاعدُ الرفّ.
 *
 * روحُ الباب: **القراءةُ ليست إنجازاً حتى تصير عملاً.** فالفائدةُ لا تُقبل حتى
 * تُكتب بعبارتك، و«السؤالُ الباقي» يُبقيها حيّةً حتى تُطبَّق.
 */
import { useState } from "react";
import type { Benefit, Book, KnowledgeSource, SourceKind } from "@/lib/types";
import { pathSteps, stepFill, sourceLabel, benefitsOf, shelfSeats, type PathStep } from "@/lib/mihbara";
import { formatDateShort } from "@/lib/utils";
import { arNum, arCount } from "@/lib/madar/format";
import { SectionHead, HeadMeta, MdrButton, Panel } from "../primitives";

export const SOURCE_KINDS: SourceKind[] = ["كتاب", "مقال", "درس", "تجربة"];

/* ─────────────────────── درجاتُ المسار ─────────────────────── */

/** خمسةُ أقواسٍ يمتلئ كلٌّ منها بقدر درجته — أينَ يتوقّف علمُك يُرى بنظرة. */
export function PathArcs({ steps }: { steps: PathStep[] }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, padding: "16px 0 0" }}>
      {steps.map((st) => (
        <div key={st.key} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
          <div
            title={st.hint}
            style={{
              position: "relative", width: "100%", height: 76,
              border: "1.4px solid var(--line)",
              borderRadius: "50% 50% 0 0 / 62% 62% 0 0",
              overflow: "hidden", background: "var(--paper2)",
            }}
          >
            <span
              style={{
                position: "absolute", insetInline: 0, bottom: 0,
                height: stepFill(st, steps), background: st.color, opacity: 0.16,
              }}
            />
            <span
              style={{
                position: "absolute", inset: 0, display: "flex",
                alignItems: "center", justifyContent: "center",
                fontSize: 17, fontWeight: 900, color: st.color,
              }}
            >
              {arNum(st.value)}
            </span>
          </div>
          <span style={{ fontSize: 10, color: "var(--ink52)", textAlign: "center", lineHeight: 1.4 }}>
            {st.label}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────── ملتقِطُ الفائدة ─────────────────────── */

/**
 * الحقلُ الأوّل نصُّ الفائدة **بعبارتك**، ثمّ المصدر، ثمّ السؤالُ الباقي.
 * الترتيبُ مقصود: تكتب أوّلاً ثمّ تنسب — فلا يصير اختيارُ المصدر عائقاً عن
 * الالتقاط.
 */
export function BenefitCapture({
  sources,
  books,
  onAdd,
  onNewSource,
}: {
  sources: KnowledgeSource[];
  books: Book[];
  onAdd: (draft: { text: string; sourceId?: string; question?: string }) => void;
  onNewSource: () => void;
}) {
  const [text, setText] = useState("");
  const [question, setQuestion] = useState("");
  const [sourceId, setSourceId] = useState<string | undefined>();

  // الكتبُ المفتوحةُ تظهر مصادرَ جاهزةً بلا إنشاءِ مصدرٍ لها — أكثرُ ما يُقرأ كتاب.
  const chips = [
    ...sources.map((s) => ({ id: s.id, label: `${s.kind} · ${s.name}` })),
    ...books
      .filter((b) => b.status === "أقرأ" && !sources.some((s) => s.bookId === b.id))
      .map((b) => ({ id: b.id, label: `كتاب · ${b.title}` })),
  ];

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    onAdd({ text: t, sourceId, question: question.trim() || undefined });
    setText("");
    setQuestion("");
    setSourceId(undefined);
  };

  return (
    <div style={{ margin: "24px 0 0", border: "1px solid var(--gline)", background: "var(--paper2)", borderRadius: 20, padding: 15 }}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="الفائدةُ بعبارتك أنت لا بعبارة الكتاب"
        lang="ar"
        dir="rtl"
        style={{
          width: "100%", boxSizing: "border-box", background: "transparent",
          border: "none", borderBottom: "1px solid var(--line)",
          fontSize: 15.5, lineHeight: 1.85, padding: "6px 0", resize: "vertical",
          fontFamily: "inherit", color: "var(--ink)", outline: "none",
        }}
      />

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "14px 0 0" }}>
        {chips.map((c) => {
          const on = sourceId === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setSourceId(on ? undefined : c.id)}
              style={{
                minHeight: 40, padding: "0 12px",
                background: on ? "var(--ink)" : "transparent",
                border: `1px solid ${on ? "var(--ink)" : "var(--line)"}`,
                color: on ? "var(--paper)" : "var(--ink72)",
                borderRadius: 12, fontSize: 12, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {c.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onNewSource}
          style={{
            minHeight: 40, padding: "0 12px", background: "transparent",
            border: "1px dashed var(--gline)", color: "var(--gold)",
            borderRadius: 12, fontSize: 12, fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          مصدرٌ جديد
        </button>
      </div>

      <input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="السؤالُ الذي بقي (اختياري)"
        lang="ar"
        dir="rtl"
        style={{
          width: "100%", boxSizing: "border-box", margin: "14px 0 0",
          background: "transparent", border: "none", borderBottom: "1px solid var(--line)",
          fontSize: 14.5, padding: "8px 0", minHeight: 40,
          fontFamily: "inherit", color: "var(--ink)", outline: "none",
        }}
      />

      <MdrButton kind="ink" onClick={submit} disabled={!text.trim()} minHeight={46} style={{ margin: "14px 0 0", padding: "0 20px" }}>
        أضِف الفائدة
      </MdrButton>
    </div>
  );
}

/* ─────────────────────── المصادر ─────────────────────── */

export function SourceList({
  sources,
  books,
  benefits,
  onAdd,
  onDelete,
}: {
  sources: KnowledgeSource[];
  books: Book[];
  benefits: Benefit[];
  onAdd: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div style={{ padding: "16px 0 0" }}>
      <MdrButton kind="ghost" onClick={onAdd} minHeight={46} style={{ padding: "0 16px", fontSize: 13 }}>
        أضِف مصدرًا
      </MdrButton>

      {sources.length === 0 && (
        <p style={{ margin: "18px 0 0", fontSize: 13.5, color: "var(--ink34)", borderTop: "1px solid var(--line)", paddingTop: 16, lineHeight: 1.8 }}>
          لا مصادرَ بعد. الكتبُ التي تقرؤها تظهر مصادرَ جاهزةً في المسار بلا إضافةٍ هنا.
        </p>
      )}

      {sources.map((s) => {
        const linked = s.bookId ? books.find((b) => b.id === s.bookId) : undefined;
        const n = benefitsOf(s.id, benefits);
        const pct = linked && linked.totalPages > 0
          ? Math.round((linked.currentPage / linked.totalPages) * 100)
          : 0;
        return (
          <div key={s.id} style={{ borderTop: "1px solid var(--line)", padding: "15px 0" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: "var(--gold)", fontWeight: 700, border: "1px solid var(--gline)", padding: "2px 7px", borderRadius: 6 }}>
                {s.kind}
              </span>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{s.name}</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11.5, color: "var(--ink34)" }}>{s.author || ""}</span>
            </div>

            {linked && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "10px 0 0" }}>
                <span style={{ flex: 1, height: 3, background: "var(--line)", display: "block", position: "relative", overflow: "hidden", borderRadius: 2 }}>
                  <span style={{ position: "absolute", insetBlock: 0, insetInlineStart: 0, background: "var(--gold)", width: `${pct}%` }} />
                </span>
                <span style={{ fontSize: 11.5, color: "var(--ink52)" }}>
                  الصفحةُ {arNum(linked.currentPage)} من {arNum(linked.totalPages)}
                </span>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, margin: "10px 0 0", flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 11.5, color: "var(--ink52)" }}>
                {n ? `${arCount(n, { one: "فائدةٌ واحدة", two: "فائدتان", few: "فوائد", many: "فائدة" })} منه` : "لا فائدةَ منه بعد"}
              </span>
              <span style={{ flex: 1 }} />
              <MdrButton kind="clay" onClick={() => onDelete(s.id)} style={{ fontSize: 12, padding: "0 12px" }}>
                احذفه
              </MdrButton>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────── الفوائد ─────────────────────── */

export function BenefitList({
  benefits,
  sources,
  books,
  onApply,
  onDelete,
}: {
  benefits: Benefit[];
  sources: KnowledgeSource[];
  books: Book[];
  onApply: (id: string, applied: boolean) => void;
  onDelete: (id: string) => void;
}) {
  if (benefits.length === 0) {
    return (
      <p style={{ margin: "20px 0 0", fontSize: 13.5, color: "var(--ink34)", lineHeight: 1.85 }}>
        لا فوائدَ بعد. المسارُ يبدأ بالتقاطٍ سريعٍ في تبويب «المسار».
      </p>
    );
  }

  return (
    <div style={{ padding: "16px 0 0" }}>
      {benefits.map((b) => (
        <div key={b.id} style={{ borderTop: "1px solid var(--line)", padding: "15px 0" }}>
          <p style={{ margin: 0, fontSize: 15.5, fontWeight: 700, lineHeight: 1.85 }}>{b.text}</p>

          {b.question?.trim() && (
            <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--clay)", lineHeight: 1.8 }}>
              سؤالٌ باقٍ · {b.question}
            </p>
          )}

          <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "var(--ink34)" }}>
            {sourceLabel(b.sourceId, sources, books)} · {formatDateShort(b.createdAt)}
          </p>

          <div style={{ display: "flex", gap: 8, margin: "11px 0 0", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: b.applied ? "var(--green)" : "var(--clay)" }}>
              {b.applied ? "مطبَّقة" : "بلا تطبيق"}
            </span>
            <span style={{ flex: 1 }} />
            <MdrButton
              kind={b.applied ? "ghost" : "gold"}
              onClick={() => onApply(b.id, !b.applied)}
              style={{ fontSize: 12, padding: "0 13px" }}
            >
              {b.applied ? "أعِدها بلا تطبيق" : "علِّمها مطبَّقة"}
            </MdrButton>
            <MdrButton kind="clay" onClick={() => onDelete(b.id)} style={{ fontSize: 12, padding: "0 12px" }}>
              احذفها
            </MdrButton>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────── مقاعدُ الرفّ ─────────────────────── */

const SHELF_COLORS = ["#8b6f47", "#6f8063", "#9d665b", "#6c708d", "#b08a4b", "#7b6d5b"];

/** كتابٌ مرئيّ لكلّ ختمة؛ المقاعدُ الفارغة تبقى مساحةً صادقةً للكتاب القادم. */
export function ShelfSeats({ books, year, goal }: { books: Book[]; year: number; goal: number }) {
  const { filled, goal: seats } = shelfSeats(books, year, goal);
  if (seats === 0) return null;
  const finished = books
    .filter((b) => b.status === "أنهيت" && (b.finishDate || "").startsWith(String(year)))
    .slice(0, seats);

  return (
    <div className="mdr-reading-shelf-display" style={{ margin: "16px 0 0" }}>
      <SectionHead
        title="رفُّك هذا العام"
        trailing={<HeadMeta>{arNum(filled)} من {arNum(seats)}</HeadMeta>}
        marginTop={0}
        marginBottom={12}
      />
      <div className="mdr-reading-shelf-frame">
        <div className="mdr-reading-shelf-note">
          <span>الكتب التي أنهيتها</span>
          <span>{filled ? `${arNum(filled)} كتاب` : "رفّك ينتظر أول كتاب"}</span>
        </div>
        <div className="mdr-reading-shelf-books" role="list" aria-label="كتب الرف المكتملة">
          {Array.from({ length: seats }, (_, i) => {
            const b = finished[i];
            const color = b?.coverColor ?? SHELF_COLORS[i % SHELF_COLORS.length];
            return (
              <div
                key={b?.id ?? `empty-${i}`}
                className={`mdr-reading-shelf-item ${b ? "is-filled" : "is-empty"}`}
                role="listitem"
                title={b ? `${b.title} · ${arNum(b.totalPages)} صفحة` : "مكانٌ لكتابٍ جديد"}
              >
                <div
                  className="mdr-reading-shelf-book"
                  style={b ? { backgroundColor: color } : undefined}
                  aria-label={b ? b.title : `المكان ${arNum(i + 1)}`}
                >
                  {b ? (
                    <>
                      <span className="mdr-reading-shelf-book-mark" />
                      <strong>{b.title}</strong>
                      <small>{arNum(b.totalPages)} ص</small>
                    </>
                  ) : (
                    <span className="mdr-reading-shelf-empty-mark">+</span>
                  )}
                </div>
                <span className="mdr-reading-shelf-book-label">{b ? b.title : `المكان ${arNum(i + 1)}`}</span>
              </div>
            );
          })}
        </div>
        <div className="mdr-reading-shelf-board" />
      </div>
      <p style={{ margin: "9px 0 0", fontSize: 11, color: "var(--ink34)" }}>
        كل كتابٍ يختمه يترك اسمه على الرف.
      </p>
    </div>
  );
}

export { pathSteps, Panel };
