import { describe, expect, it } from "vitest";
import { nativeJpegBlob } from "./camera";

describe("تحويل صورة الكاميرا إلى JPEG", () => {
  it("يحوّل base64 مع أو دون بادئة data URL إلى Blob من نوع JPEG", async () => {
    const plain = nativeJpegBlob("AQID");
    const dataUrl = nativeJpegBlob("data:image/jpeg;base64,AQID");
    expect(plain.type).toBe("image/jpeg");
    expect(dataUrl.type).toBe("image/jpeg");
    expect([...new Uint8Array(await dataUrl.arrayBuffer())]).toEqual([1, 2, 3]);
  });
});
