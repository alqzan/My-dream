"use client";
/**
 * **الأرقامُ الهندية في كلّ التطبيق — من موضعٍ واحد.**
 *
 * المنسّقات (`formatAmount` · `formatDate` · `formatClock` · `arabicCount`)
 * صارت هنديةً في `utils.ts`، لكنّ في الواجهة **٥٦١ موضعاً** يُدرج فيها الرقم
 * خاماً في JSX (`{logs.length}` · `{Math.round(pct)}%` · `{streak}`). تعديلُها
 * موضعاً موضعاً تعديلٌ في ثمانين ملفاً لا يمسّها هذا العمل أصلاً — وكلُّ ملفٍّ
 * فرصةُ كسر. فالتحويلُ هنا: مرورٌ واحدٌ على عُقَد النصّ بعد الترطيب.
 *
 * **لماذا هذا آمنٌ مع React؟** React يكتب `nodeValue` ولا يقرؤه: نموذجُه
 * الافتراضيّ يحمل النصّ الذي كتبه هو، فتعديلُنا لا يُفسد مطابقةً ولا يرمي.
 * وحين يُحدِّث React النصَّ يكتب اللاتينيّ ثمّ يعيده المراقبُ هندياً — مرورٌ
 * إضافيٌّ صغير، لا تعارض. والحلقةُ لا تدور: بعد التحويل لا يبقى رقمٌ لاتينيٌّ
 * فتُصبح إعادةُ النداء بلا عمل.
 *
 * **ولماذا بعد الترطيب لا قبله؟** لأنّ الخادمَ (البناء الثابت) يُخرج اللاتينيّ
 * في هذه المواضع؛ فلو حوّلنا في الرسم الأوّل لاختلف نصُّ العميل عن نصّ الخادم
 * ووقع تعارضُ ترطيب. `useEffect` يقع بعد الترطيب فلا خلاف.
 *
 * **ما يبقى لاتينياً عمداً**: كلُّ ما هو **معرّفٌ لا كمّية** — رقمُ الإصدار،
 * ومفاتيحُ التواريخ، وأحجامُ الملفات، ونصُّ رسالةِ المصرف كما وصلت. علّمه
 * بـ`data-digits="latin"` على العنصر أو على أيّ جدٍّ له.
 */
import { useEffect } from "react";
import { toIndicDigits } from "@/lib/utils";

/** وسمٌ يُعفي عنصراً وذريّتَه من التحويل. */
export const LATIN_DIGITS_ATTR = { "data-digits": "latin" } as const;

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "CODE", "PRE", "INPUT", "TEXTAREA", "SVG"]);

/** هل يقع هذا النصُّ داخل موضعٍ لا يُحوَّل؟ */
function skipped(node: Text): boolean {
  let el: HTMLElement | null = node.parentElement;
  while (el) {
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.isContentEditable) return true;
    if (el.dataset?.digits === "latin") return true;
    // نصٌّ حرفيٌّ بلغةٍ أخرى (رسالةُ مصرفٍ ملصوقة) يبقى كما وصل.
    if (el.getAttribute?.("dir") === "ltr") return true;
    el = el.parentElement;
  }
  return false;
}

function convertUnder(root: Node) {
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const hits: Text[] = [];
  let n: Node | null;
  while ((n = walk.nextNode())) {
    const t = n as Text;
    const v = t.nodeValue;
    if (!v || !/[0-9]/.test(v)) continue;
    if (skipped(t)) continue;
    hits.push(t);
  }
  for (const t of hits) t.nodeValue = toIndicDigits(t.nodeValue!);
}

export function IndicDigits() {
  useEffect(() => {
    convertUnder(document.body);

    const obs = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "characterData") {
          const t = r.target as Text;
          const v = t.nodeValue;
          if (v && /[0-9]/.test(v) && !skipped(t)) t.nodeValue = toIndicDigits(v);
        } else {
          r.addedNodes.forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE) {
              const t = node as Text;
              const v = t.nodeValue;
              if (v && /[0-9]/.test(v) && !skipped(t)) t.nodeValue = toIndicDigits(v);
            } else if (node.nodeType === Node.ELEMENT_NODE) {
              convertUnder(node);
            }
          });
        }
      }
    });
    obs.observe(document.body, { subtree: true, childList: true, characterData: true });
    return () => obs.disconnect();
  }, []);

  return null;
}
