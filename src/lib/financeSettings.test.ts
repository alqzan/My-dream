import { describe, expect, it } from "vitest";
import { parseFinanceSettingsProfile } from "./financeSettings";

describe("finance settings profile", () => {
  it("accepts a generic owner profile and normalizes values", () => {
    const profile = parseFinanceSettingsProfile({
      format: "madar-bank-settings", version: 1,
      ownerAccounts: ["a", " a "], ownerWallets: [], ownerAliases: [], salaryPayers: ["payer"],
      payerAliases: { payer: "Payer" }, salaryPattern: { day: 26, amounts: [10, -1, 12] },
      merchantRules: { Cafe: "cat-luxuries" }, cashbackEnabled: false,
    });
    expect(profile.ownerAccounts).toEqual(["a"]);
    expect(profile.salaryPattern?.amounts).toEqual([10, 12]);
  });

  it("rejects an unrelated JSON file", () => {
    expect(() => parseFinanceSettingsProfile({ version: 1 })).toThrow();
  });
});
