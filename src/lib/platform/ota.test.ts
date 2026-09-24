import { describe, expect, it } from "vitest";
import { parseOtaManifest } from "./ota";

const validManifest = {
  appBuild: 450,
  version: "0.1.450",
  url: "https://alqzan.github.io/My-dream/ota/madar-0.1.450.zip",
  checksum: "a".repeat(64),
};

describe("native OTA manifest", () => {
  it("accepts a newer immutable Pages bundle with matching build and version", () => {
    expect(parseOtaManifest(validManifest, 449)).toEqual(validManifest);
  });

  it("ignores the current build and downgrade candidates", () => {
    expect(parseOtaManifest(validManifest, 450)).toBeNull();
    expect(parseOtaManifest({ ...validManifest, appBuild: 448, version: "0.1.448", url: "https://alqzan.github.io/My-dream/ota/madar-0.1.448.zip" }, 449)).toBeNull();
  });

  it("rejects mismatched version/build, non-HTTPS URLs, other hosts, and malformed checksums", () => {
    expect(parseOtaManifest({ ...validManifest, version: "0.1.451" }, 449)).toBeNull();
    expect(parseOtaManifest({ ...validManifest, url: "http://alqzan.github.io/My-dream/ota/madar-0.1.450.zip" }, 449)).toBeNull();
    expect(parseOtaManifest({ ...validManifest, url: "https://example.com/My-dream/ota/madar-0.1.450.zip" }, 449)).toBeNull();
    expect(parseOtaManifest({ ...validManifest, checksum: "short" }, 449)).toBeNull();
  });
});
