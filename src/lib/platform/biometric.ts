import { Capacitor } from "@capacitor/core";

/** يختبر توافر بصمة الجهاز من دون أن يجعلها شرطاً لفتح التطبيق. */
export async function canUnlockWithBiometrics(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { NativeBiometric } = await import("@capgo/capacitor-native-biometric");
    return (await NativeBiometric.isAvailable({ useFallback: false })).isAvailable;
  } catch {
    return false;
  }
}

/** فشل البصمة أو إلغاؤها يعيد false فقط؛ لا يغيّر قفل الرمز أو عدّاد محاولاته. */
export async function authenticateBiometricUnlock(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { NativeBiometric } = await import("@capgo/capacitor-native-biometric");
    await NativeBiometric.verifyIdentity({
      reason: "افتح مدار للوصول إلى بياناتك الخاصة",
      title: "فتح مدار",
      subtitle: "تحقّق من هويتك",
      description: "يمكنك دائماً إدخال رمز القفل بدلاً من ذلك",
      useFallback: false,
      fallbackTitle: "",
    });
    return true;
  } catch {
    return false;
  }
}
