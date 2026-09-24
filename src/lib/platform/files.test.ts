import { beforeEach, describe, expect, it, vi } from "vitest";

const { nativeMode, platform, written, share } = vi.hoisted(() => ({
  nativeMode: { value: true },
  platform: { value: "ios" },
  written: { value: null as null | { path: string; data: string } },
  share: { reject: false, activityType: "com.apple.UIKit.activity.SaveToFiles" as string | null },
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => nativeMode.value,
    getPlatform: () => platform.value,
  },
}));

vi.mock("@capacitor/filesystem", () => ({
  Directory: { Cache: "CACHE" },
  Filesystem: {
    writeFile: async (options: { path: string; data: string }) => {
      written.value = options;
      return { uri: `file:///cache/${options.path}` };
    },
  },
}));

vi.mock("@capacitor/share", () => ({
  Share: {
    share: async () => {
      if (share.reject) throw new Error("Share canceled");
      return { activityType: share.activityType };
    },
  },
}));

import { saveFile, saveTextFile } from "./files";

beforeEach(() => {
  nativeMode.value = true;
  platform.value = "ios";
  written.value = null;
  share.reject = false;
  share.activityType = "com.apple.UIKit.activity.SaveToFiles";
});

describe("native file saving", () => {
  it("writes the file then awaits a completed share", async () => {
    const saved = await saveFile("backup.json", new Blob(["Hello"]));

    expect(saved).toBe(true);
    expect(written.value).toEqual({
      path: "backup.json",
      data: "SGVsbG8=",
      directory: "CACHE",
      recursive: true,
    });
  });

  it("reports a dismissed or failed share as failure", async () => {
    share.reject = true;

    await expect(saveFile("backup.json", new Blob(["data"]))).resolves.toBe(false);
  });

  it("accepts a resolved share even when the platform omits activityType", async () => {
    share.activityType = null;

    await expect(saveFile("backup.json", new Blob(["data"]))).resolves.toBe(true);
  });

  it("supports text-file saves through the same native path", async () => {
    await expect(saveTextFile("report.txt", "hello")).resolves.toBe(true);
    expect(written.value?.path).toBe("report.txt");
  });
});

describe("browser file saving", () => {
  it("retains the previous false result when no document exists", async () => {
    nativeMode.value = false;
    vi.stubGlobal("document", undefined);

    await expect(saveFile("backup.json", new Blob(["data"]))).resolves.toBe(false);
  });
});
