import { beforeEach, describe, expect, it, vi } from "vitest";

const { save, setPref } = vi.hoisted(() => ({
  save: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
  setPref: vi.fn(),
}));

vi.mock("./platform/files", () => ({ saveFile: save }));
vi.mock("./platform/prefs", () => ({ prefSet: setPref }));

import { downloadPlainBackup, LAST_BACKUP_KEY } from "./backupFile";

beforeEach(() => {
  save.mockReset();
  setPref.mockReset();
});

describe("downloadPlainBackup", () => {
  it("reports a failed save and does not mark the backup complete", async () => {
    save.mockResolvedValue(false);

    await expect(downloadPlainBackup({} as never)).resolves.toBe(false);

    expect(setPref).not.toHaveBeenCalled();
  });

  it("marks the backup only after the file/share operation succeeds", async () => {
    save.mockResolvedValue(true);

    await expect(downloadPlainBackup({} as never)).resolves.toBe(true);

    expect(setPref).toHaveBeenCalledWith(LAST_BACKUP_KEY, expect.any(String));
  });
});
