import { describe, expect, it } from "vitest";
import { selectAudioMimeType } from "./AudioRecorder";

describe("اختيار صيغة تسجيل الملاحظة الصوتية", () => {
  it("يقدّم MP4 على iOS الأصلي عند دعمه", () => {
    const supported = new Set(["audio/mp4", "audio/webm;codecs=opus"]);
    expect(selectAudioMimeType((type) => supported.has(type), true)).toBe("audio/mp4");
  });

  it("يحافظ على أولوية WebM/Opus في المتصفح", () => {
    const supported = new Set(["audio/mp4", "audio/webm;codecs=opus"]);
    expect(selectAudioMimeType((type) => supported.has(type))).toBe("audio/webm;codecs=opus");
  });

  it("يختار MP4 الأصلي إن كان الخيار الوحيد المدعوم", () => {
    expect(selectAudioMimeType((type) => type === "audio/mp4", true)).toBe("audio/mp4");
  });
});
