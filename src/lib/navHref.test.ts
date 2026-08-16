import { describe, expect, it } from "vitest";
import { nativeNavHref } from "./navHref";

describe("nativeNavHref", () => {
  it("keeps root-hosted routes under the static export root", () => {
    expect(nativeNavHref("/journal")).toBe("/journal/");
    expect(nativeNavHref("/")).toBe("/");
  });

  it("adds the GitHub Pages project path", () => {
    expect(nativeNavHref("/journal", "/My-dream")).toBe("/My-dream/journal/");
    expect(nativeNavHref("/", "/My-dream/")).toBe("/My-dream/");
  });
});
