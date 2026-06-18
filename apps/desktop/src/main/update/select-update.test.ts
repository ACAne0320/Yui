import { describe, expect, it } from "vitest";
import {
  compareVersions,
  type GithubRelease,
  isNewerVersion,
  selectUpdate,
} from "./select-update.ts";

const ARCH = "arm64";

// Build a stable release whose ZIP/checksum assets follow the real naming.
function release(version: string, overrides: Partial<GithubRelease> = {}): GithubRelease {
  return {
    tag_name: `v${version}`,
    body: `notes for ${version}`,
    html_url: `https://github.com/ACAne0320/Yui/releases/tag/v${version}`,
    published_at: `2026-06-${version.split(".")[2]?.padStart(2, "0") ?? "01"}T00:00:00Z`,
    draft: false,
    prerelease: false,
    assets: [
      { name: "SHA256SUMS.txt", browser_download_url: `https://dl/${version}/SHA256SUMS.txt` },
      { name: `Yui-${version}-mac-arm64.zip`, browser_download_url: `https://dl/${version}/zip` },
      { name: `Yui-${version}-mac-arm64.dmg`, browser_download_url: `https://dl/${version}/dmg` },
    ],
    ...overrides,
  };
}

describe("selectUpdate", () => {
  it("returns null when no release is newer than the current version", () => {
    const releases = [release("0.0.2"), release("0.0.1")];
    expect(selectUpdate(releases, "0.0.2", ARCH)).toBeNull();
  });

  it("targets the newest stable release and points at its arch ZIP + checksums", () => {
    const releases = [release("0.0.4"), release("0.0.3"), release("0.0.2")];
    const selection = selectUpdate(releases, "0.0.2", ARCH);

    expect(selection?.target).toEqual({
      version: "0.0.4",
      zipUrl: "https://dl/0.0.4/zip",
      zipName: "Yui-0.0.4-mac-arm64.zip",
      checksumsUrl: "https://dl/0.0.4/SHA256SUMS.txt",
    });
    expect(selection?.release.version).toBe("0.0.4");
    expect(selection?.release.url).toBe(releases[0]!.html_url);
  });

  it("aggregates the changelog across every skipped version, newest first", () => {
    const releases = [release("0.0.4"), release("0.0.3"), release("0.0.2"), release("0.0.1")];
    const notes = selectUpdate(releases, "0.0.1", ARCH)?.release.notes ?? "";

    expect(notes).toBe(
      "## v0.0.4\n\nnotes for 0.0.4\n\n## v0.0.3\n\nnotes for 0.0.3\n\n## v0.0.2\n\nnotes for 0.0.2",
    );
    // The user's own version (0.0.1) is excluded from the changelog.
    expect(notes).not.toContain("0.0.1");
  });

  it("ignores draft and prerelease entries", () => {
    const releases = [
      release("0.0.5", { prerelease: true }),
      release("0.0.4", { draft: true }),
      release("0.0.3"),
    ];
    const selection = selectUpdate(releases, "0.0.2", ARCH);

    expect(selection?.target.version).toBe("0.0.3");
    expect(selection?.release.notes).toBe("## v0.0.3\n\nnotes for 0.0.3");
  });

  it("falls back past a newer release that ships no installable ZIP", () => {
    // 0.0.5 exists but has no archive for this arch — can't be applied, so the
    // target is 0.0.4, and 0.0.5 is left out of the changelog too.
    const releases = [release("0.0.5", { assets: [] }), release("0.0.4"), release("0.0.3")];
    const selection = selectUpdate(releases, "0.0.3", ARCH);

    expect(selection?.target.version).toBe("0.0.4");
    expect(selection?.release.notes).toBe("## v0.0.4\n\nnotes for 0.0.4");
    expect(selection?.release.notes).not.toContain("0.0.5");
  });

  it("tolerates GitHub returning releases out of version order", () => {
    const releases = [release("0.0.2"), release("0.0.4"), release("0.0.3")];
    expect(selectUpdate(releases, "0.0.2", ARCH)?.target.version).toBe("0.0.4");
  });

  it("uses an empty checksums URL when no SHA256SUMS asset is present", () => {
    const releases = [
      release("0.0.3", {
        assets: [{ name: "Yui-0.0.3-mac-arm64.zip", browser_download_url: "https://dl/0.0.3/zip" }],
      }),
    ];
    expect(selectUpdate(releases, "0.0.2", ARCH)?.target.checksumsUrl).toBeNull();
  });
});

describe("version comparison", () => {
  it("orders semantic versions by major, minor, then patch", () => {
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("1.3.0", "1.2.9")).toBe(1);
    expect(compareVersions("0.0.2", "0.1.0")).toBe(-1);
  });

  it("treats a leading v and pre-release suffix the same as the core version", () => {
    expect(isNewerVersion("v0.0.3", "0.0.2")).toBe(true);
    expect(isNewerVersion("0.0.2-beta.1", "0.0.2")).toBe(false);
  });
});
