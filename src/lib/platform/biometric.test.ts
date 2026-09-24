import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  native: false,
  available: vi.fn(),
  verify: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => mock.native },
}));
vi.mock("@capgo/capacitor-native-biometric", () => ({
  NativeBiometric: {
    isAvailable: mock.available,
    verifyIdentity: mock.verify,
  },
}));

import { authenticateBiometricUnlock, canUnlockWithBiometrics } from "./biometric";

beforeEach(() => {
  mock.native = false;
  mock.available.mockReset();
  mock.verify.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("فتح التطبيق بالبصمة", () => {
  it("لا يستدعي إضافة البصمة في المتصفح", async () => {
    expect(await canUnlockWithBiometrics()).toBe(false);
    expect(await authenticateBiometricUnlock()).toBe(false);
    expect(mock.available).not.toHaveBeenCalled();
    expect(mock.verify).not.toHaveBeenCalled();
  });

  it("يتيحها على الأصلي عند وجود بصمة مسجلة", async () => {
    mock.native = true;
    mock.available.mockResolvedValue({ isAvailable: true });
    expect(await canUnlockWithBiometrics()).toBe(true);
    expect(mock.available).toHaveBeenCalledWith({ useFallback: false });
  });

  it("يحوّل الإلغاء أو الفشل إلى مسار PIN من دون رمي", async () => {
    mock.native = true;
    mock.verify.mockRejectedValue(new Error("authentication cancelled"));
    expect(await authenticateBiometricUnlock()).toBe(false);
    expect(mock.verify).toHaveBeenCalledWith(expect.objectContaining({ useFallback: false }));
  });
});
