"use client";
/**
 * قِطعُ المحبرة المعروضة: **مقاعدُ الرفّ**.
 *
 * كان هنا مسارُ المعرفة كذلك (درجاتُ المسار · ملتقِطُ الفائدة · المصادر ·
 * الفوائد). بُني كاملاً ولم يُعرض في شاشةٍ قطّ، فحُذف بقرارٍ صريح بعد مراجعةٍ
 * شاملة — و**بياناتُه باقية** (`knowledgeSources` و`benefits` في `AppData`
 * والنسخِ الاحتياطي والدمج)، فإن عاد الباب عادت إليه سليمةً. تاريخُه في
 * `git` كاملاً.
 */
import type { Book } from "@/lib/types";
import { shelfSeats } from "@/lib/mihbara";
import { arNum } from "@/lib/madar/format";
import { SectionHead, HeadMeta } from "../primitives";

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
