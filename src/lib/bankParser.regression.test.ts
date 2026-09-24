import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseBankSmsBulk } from "./bankParser";
import { defaultIncluded, isAutoApprovableBankEvent } from "./bankImportPolicy";
import { parseBankSms as parseLegacyBankSms } from "./bankParserOld.audit";
import { toLatinDigits } from "./utils";

const D = "2026-01-17";

describe("bank SMS regressions from card-first purchase templates", () => {
  it.each([
    ["1493", "5", "TEST DONATION"],
    ["4826", "39", "TEST LAUNDRY"],
  ])("reads the labeled amount after card/account fields (%s)", (card, amount, merchant) => {
    const sms = [
      "شراء انترنت",
      `عبر:${card};مدى-ابل باي`,
      "من:9004",
      `بـSAR ${amount}`,
      `لـ${merchant}`,
      "؜17/1/26 06:09",
    ].join("\n");

    for (const options of [{}, { sender: "AlRajhiBank" }]) {
      const event = parseBankSmsBulk(sms, D, options).events[0];
      expect(event?.kind).toBe("purchase");
      expect(event?.amount).toBe(Number(amount));
    }
  });

  it("does not treat a four-digit card/account field as an amount", () => {
    const event = parseBankSmsBulk(
      "شراء انترنت\nعبر:4826;مدى\nمن:9004\nلدى:TEST SHOP\n؜17/1/26 06:09",
      D,
      { sender: "AlRajhiBank" },
    ).events[0];

    expect(event?.account).toBe("4826");
    expect(event?.confidence).toBe("generic");
    expect(event?.amount).toBe(0);
    expect(event?.reviewReason).toBeTruthy();
  });

  it("holds a currency amount that repeats a four-digit instrument suffix, with or without sender metadata", () => {
    const sms = "شراء\nبطاقة:6382\n6382 SAR\nفي:2026-01-17 06:09";
    for (const options of [{}, { sender: "AlRajhiBank" }]) {
      const event = parseBankSmsBulk(sms, D, options).events[0];
      expect(event?.confidence).toBe("generic");
      expect(event?.amount).toBe(0);
      expect(event?.reviewReason).toMatch(/مبلغ موثوق/);
    }
  });

  it("holds even a labeled amount when it duplicates a card suffix", () => {
    const event = parseBankSmsBulk(
      "شراء\nبطاقة:6382\nمبلغ: 6382 SAR\nفي:2026-01-17 06:09",
      D,
      { sender: "AlRajhiBank" },
    ).events[0];

    expect(event?.amount).toBe(0);
    expect(event?.confidence).toBe("generic");
    expect(event?.reviewReason).toMatch(/مبلغ موثوق/);
  });

  it("does not treat a credit-card balance as an unlabeled settlement amount", () => {
    const event = parseBankSmsBulk(
      "تم سداد البطاقة الائتمانية\nالرصيد المتوفر: SAR 3489.54\nالرصيد السابق: SAR 2611.98\nفي:2026-09-01",
      "2026-09-01",
      { sender: "AlRajhiBank", receivedAt: "2026-09-01 15:41:21" },
    ).events[0];
    expect(event?.kind).toBe("card_settle");
    expect(event?.amount).toBe(0);
    expect(event?.balanceKind).toBe("credit_available");
  });

  it.each([
    ["عملية شراء\nمبلغ: SAR 63.80\nلدى: Tamara\nفي:2026-08-14", 63.8],
    ["عملية شراء\nمبلغ: SAR 58.02\nمن Tamara\nفي:2026-08-14", 58.02],
  ])("treats Tamara in a merchant field as a purchase, not the sender", (sms, amount) => {
    const event = parseBankSmsBulk(sms, D).events[0];
    expect(event?.kind).toBe("purchase");
    expect(event?.amount).toBe(amount);
  });

  it("keeps known-wallet purchases in review with or without sender metadata", () => {
    const sms = "شراء إنترنت\nبطاقة:5319;فيزا-ابل باي\nمبلغ:5000.00 SAR\nلدى:barq\nفي:2026-12-03 14:05";
    for (const options of [
      {},
      { sender: "AlRajhiBank" },
      { ownerWallets: ["barq"] },
      { sender: "AlRajhiBank", ownerWallets: ["barq"] },
    ]) {
      const event = parseBankSmsBulk(sms, "2026-12-03", options).events[0];
      expect(isAutoApprovableBankEvent(event!)).toBe(false);
      expect(event?.reviewReason).toMatch(/محفظتك|محفظة|تحويل/);
    }
  });

  it("routes configured-wallet purchases into outgoing self-transfer review", () => {
    const event = parseBankSmsBulk(
      "شراء إنترنت\nبطاقة:5319;فيزا-ابل باي\nمبلغ:4000 SAR\nلدى:محفظتي برق\nفي:2026-12-03 14:05",
      "2026-12-03",
      { sender: "AlRajhiBank", ownerWallets: ["محفظتي برق"] },
    ).events[0];
    expect(event).toMatchObject({ kind: "self_transfer", direction: "out", confidence: "generic" });
    expect(event?.expenseAmount).toBe(0);
    expect(isAutoApprovableBankEvent(event!)).toBe(false);
  });

  it("recognizes an incoming internal transfer from a known wallet as a review candidate", () => {
    const event = parseBankSmsBulk(
      "حوالة داخلية\nمن:Drahim\nمبلغ:SAR 4000\nفي:2026-12-03 14:05",
      "2026-12-03",
    ).events[0];
    expect(event).toMatchObject({ kind: "self_transfer", direction: "in", confidence: "generic" });
    expect(event?.reviewReason).toMatch(/محفظة|تحويل/);
  });

  it.each([
    "تم تسجيلك بنجاح في الخدمة الجديدة",
    "اشعار: تم تسجيل جهاز جديد على حسابك",
  ])("keeps non-financial account notices out of the expense review queue", (sms) => {
    const event = parseBankSmsBulk(sms, D).events[0];
    expect(["marketing", "info"]).toContain(event?.kind);
    expect(event?.amount).toBe(0);
  });

  it("does not let an unknown sender increase confidence and recognizes Arabic bank contacts", () => {
    const sms = "شراء إنترنت\nمبلغ: SAR 50\nلدى: TEST SHOP\n17/1/26 06:09";
    const withoutSender = parseBankSmsBulk(sms, D).events[0];
    const numericSender = parseBankSmsBulk(sms, D, { sender: "900" }).events[0];
    const personalSender = parseBankSmsBulk(sms, D, { sender: "Abdulrahman" }).events[0];
    expect(numericSender?.confidence).toBe(withoutSender?.confidence);
    expect(personalSender?.confidence).toBe(withoutSender?.confidence);

    for (const sender of ["بنك الراجحي", "الاهلي", "البنك السعودي البريطاني"]) {
      expect(parseBankSmsBulk(sms, D, { sender }).events[0]?.confidence).toBe("template");
    }
    expect(parseBankSmsBulk(sms, D, { sender: "بنك الراجحي" }).events[0]?.bank).toBe("rajhi");
  });
});

const privateCorpusPath = join(process.cwd(), ".local-fixtures", "bank-sms-corpus.json");
const WALLET_MENTION = /barq|برق|drahim|دراهم|stc\s*bank|بنك\s*stc|tiqmo|تيقمو|d360|دي\s*360|tweeq|تويك|urpay|يورباي/i;
const EXPENSE_KINDS = new Set(["purchase", "atm", "bill", "fee", "installment"]);
const EXPLICIT_AMOUNT = /(?:مبلغ|amount)\s*[:：]?[^\d٠-٩]{0,16}(\d[\d٠-٩,]*(?:[.٫][\d٠-٩]+)?)|(?:^|[\s\u061c])بـ?\s*(?:SAR|SR|ريال)?\s*(\d[\d٠-٩,]*(?:[.٫][\d٠-٩]+)?)|\bFor\s*[:：]?\s*(?:SAR|SR|ريال)?\s*(\d[\d٠-٩,]*(?:[.٫][\d٠-٩]+)?)/im;

function explicitAmountFromLabel(text: string): number | undefined {
  const normalized = toLatinDigits(text);
  const labeledLine = normalized.match(/(?:مبلغ|amount)\s*[:：]?([^\n\r]*)/i)?.[1];
  if (labeledLine) {
    // A card receipt can put a card suffix before the currency-qualified
    // amount on the same labeled line. Prefer the first amount paired with a
    // currency; the first bare number is only a fallback.
    const qualified = [...labeledLine.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(?:SAR|SR|ريال)|(?:SAR|SR|ريال)\s*(\d[\d,]*(?:\.\d+)?)/gi)]
      .map((match) => ({ index: match.index ?? 0, raw: match[1] ?? match[2] }))
      .sort((a, b) => a.index - b.index)[0];
    const raw = qualified?.raw ?? labeledLine.match(/[0-9][0-9,]*(?:\.[0-9]+)?/)?.[0];
    if (raw) {
      const amount = Number(raw.replace(/,/g, ""));
      if (Number.isFinite(amount)) return amount;
    }
  }
  const match = normalized.match(EXPLICIT_AMOUNT);
  const raw = match?.[1] ?? match?.[2] ?? match?.[3];
  if (!raw) return undefined;
  const amount = Number(raw.replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : undefined;
}

describe.skipIf(!existsSync(privateCorpusPath))("private bank-SMS corpus acceptance (local fixture only)", () => {
  it("keeps trusted amounts, blocks wrong automatic amounts and wallet auto-saves, and preselects safe expenses", () => {
    const corpus = JSON.parse(readFileSync(privateCorpusPath, "utf8")) as Record<string, unknown> & {
      _special_cases?: { sample: { text: string; receivedAt?: string; sender?: string }; expect: Record<string, unknown> }[];
    };
    const groups = Object.entries(corpus).filter(([, value]) =>
      value !== null && typeof value === "object" && "templates" in value
    ) as Array<[string, {
      sender?: string;
      templates: Array<{ samples?: Array<{ text?: string; receivedAt?: string; sender?: string }> }>;
    }]>;
    const audit = {
      groups: groups.length,
      samples: 0,
      oldAndFieldAgreed: 0,
      autoNoSender: 0,
      autoWithSender: 0,
      autoWrongAmountNoSender: 0,
      autoWrongAmountWithSender: 0,
      knownWalletPurchaseAutoNoSender: 0,
      knownWalletPurchaseAutoWithSender: 0,
      expenses: 0,
      selectedExpenses: 0,
      uncheckedExpensesWithoutReason: 0,
    };

    for (const [, group] of groups) {
      for (const template of group.templates ?? []) {
        for (const sample of template.samples ?? []) {
          if (!sample.text) continue;
          audit.samples += 1;
          const date = sample.receivedAt?.slice(0, 10) || D;
          const old = parseLegacyBankSms(sample.text, date);
          const labeledAmount = explicitAmountFromLabel(sample.text);

          const withoutSender = parseBankSmsBulk(sample.text, date, {
            ...(sample.receivedAt ? { receivedAt: sample.receivedAt } : {}),
          }).events[0];
          if (withoutSender && EXPENSE_KINDS.has(withoutSender.kind) && withoutSender.direction === "out") {
            audit.expenses += 1;
            const selected = defaultIncluded(withoutSender, false, { dailyRate: 0 });
            if (selected.included) audit.selectedExpenses += 1;
            else if (!selected.reason) audit.uncheckedExpensesWithoutReason += 1;
            if (old && labeledAmount !== undefined && old.amount === labeledAmount) {
              audit.oldAndFieldAgreed += 1;
              expect(withoutSender.amount).toBe(old.amount);
            }
          }

          const sender = sample.sender ?? group.sender;
          for (const withSender of [false, true]) {
            const event = withSender && sender
              ? parseBankSmsBulk(sample.text, date, {
                  sender,
                  ...(sample.receivedAt ? { receivedAt: sample.receivedAt } : {}),
                }).events[0]
              : withoutSender;
            const auto = Boolean(event && isAutoApprovableBankEvent(event));
            if (auto) audit[withSender ? "autoWithSender" : "autoNoSender"] += 1;
            // Treat an amount as an oracle only when the explicit labeled
            // amount and the legacy parser independently agree. A bare first
            // number in a multi-value bank line can be a card suffix.
            const independentlyExpected = old && labeledAmount !== undefined && old.amount === labeledAmount
              ? old.amount
              : undefined;
            if (auto && event && independentlyExpected !== undefined && event.amount !== independentlyExpected) {
              audit[withSender ? "autoWrongAmountWithSender" : "autoWrongAmountNoSender"] += 1;
            }
            if (auto && event?.kind === "purchase" && WALLET_MENTION.test(sample.text)) {
              audit[withSender ? "knownWalletPurchaseAutoWithSender" : "knownWalletPurchaseAutoNoSender"] += 1;
            }
          }
        }
      }
    }

    for (const [index, entry] of (corpus._special_cases ?? []).entries()) {
      const date = entry.sample.receivedAt?.slice(0, 10) || D;
      for (const withSender of [false, true]) {
        const event = parseBankSmsBulk(entry.sample.text, date, {
          ...(withSender && entry.sample.sender ? { sender: entry.sample.sender } : {}),
          ...(entry.sample.receivedAt ? { receivedAt: entry.sample.receivedAt } : {}),
        }).events[0];
        // Salary inference needs the user's confirmed payer/account history;
        // the stateless SMS parser must keep an unlabelled incoming transfer
        // as transfer_in until that contextual check is available.
        const contextualSalary = entry.expect.kind === "salary"
          && !/(?:راتب|salary)/i.test(entry.sample.text);
        if (contextualSalary) {
          expect(event?.kind, `special case ${index}, contextual salary remains unconfirmed`).toBe("transfer_in");
          expect(event?.direction).toBe("in");
          expect(event?.expenseAmount).toBe(0);
          expect(Boolean(event && isAutoApprovableBankEvent(event))).toBe(false);
        }
        for (const key of ["amount", "kind", "direction", "fee", "debtRemaining", "balanceKind"] as const) {
          if (key in entry.expect && !(contextualSalary && key === "kind")) {
            const actual = key === "fee" && entry.expect.fee === 0
              ? event?.fee ?? 0
              : (event as unknown as Record<string, unknown> | undefined)?.[key];
            expect(actual, `special case ${index}, ${key}, sender=${withSender}`).toEqual(entry.expect[key]);
          }
        }
        if (withSender && "autoApprovable" in entry.expect) {
          expect(Boolean(event && isAutoApprovableBankEvent(event)), `special case ${index}, autoApprovable`)
            .toBe(entry.expect.autoApprovable);
        }
      }
    }

    const selectionPercent = audit.expenses ? audit.selectedExpenses / audit.expenses : 0;
    console.log("BANK_CORPUS_ACCEPTANCE", JSON.stringify({
      ...audit,
      preselectedExpensePercent: Number((selectionPercent * 100).toFixed(1)),
    }));
    expect(audit.groups).toBe(19);
    expect(audit.samples).toBe(455);
    expect(audit.oldAndFieldAgreed).toBeGreaterThan(0);
    expect(audit.autoWrongAmountNoSender).toBe(0);
    expect(audit.autoWrongAmountWithSender).toBe(0);
    expect(audit.knownWalletPurchaseAutoNoSender).toBe(0);
    expect(audit.knownWalletPurchaseAutoWithSender).toBe(0);
    expect(audit.uncheckedExpensesWithoutReason).toBe(0);
    expect(selectionPercent).toBeGreaterThanOrEqual(0.9);
  });
});

describe("incoming local transfer with a bank-code payer prefix", () => {
  // صيغةُ حوالةٍ واردة كما تصل (بقيمٍ مغيّرة): «من<رمز البنك>;<الجهة>» بلا مسافة.
  const sms = "حوالة محلية واردة بـSR 12345.67\nلـ9999\nمن0023;ACME FINANCIAL CO\n26/9/24 09:31";

  it("reads the payer name after the bank code", () => {
    const event = parseBankSmsBulk(sms, "2026-09-24").events[0];
    expect(event?.kind).toBe("transfer_in");
    expect(event?.amount).toBe(12345.67);
    expect(event?.counterparty).toBe("ACME FINANCIAL CO");
  });

  it.each([
    "إيداع رواتب\nمبلغ: 12000 SAR\nالى: 1234",
    "Salary deposit SAR 12000 credited to account 1234",
    "Payroll SAR 12,000.00 credited to your account",
  ])("classifies plural and English salary wording as salary: %s", (text) => {
    expect(parseBankSmsBulk(text, "2026-09-24").events[0]?.kind).toBe("salary");
  });
});
