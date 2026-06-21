import { describe, expect, it } from "vitest";
import {
  compareVersions,
  isNewerVersion,
  selectUpdate,
  type UpdateManifest,
} from "./select-update.ts";

const ARCH = "arm64";

// Build a manifest whose latest version is `version` and whose `versions[]`
// covers `version` down through `0.0.1`, mirroring what the CI generator emits.
function manifest(version: string, overrides: Partial<UpdateManifest> = {}): UpdateManifest {
  const [, , patch] = version.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const history = Array.from({ length: patch }, (_, i) => `${0}.${0}.${patch - i}`);
  return {
    version,
    tag: `v${version}`,
    publishedAt: `2026-06-${String(patch).padStart(2, "0")}T00:00:00Z`,
    url: `https://github.com/ACAne0320/Yui/releases/tag/v${version}`,
    assets: {
      arm64: {
        zipName: `Yui-${version}-mac-arm64.zip`,
        zipUrl: `https://dl/${version}/arm64.zip`,
        sha256: `${"a".repeat(64)}`,
      },
    },
    versions: history.map((v) => ({ version: v, notes: `notes for ${v}` })),
    ...overrides,
  };
}

describe("selectUpdate", () => {
  it("returns null when the manifest is not newer than the current version", () => {
    expect(selectUpdate(manifest("0.0.2"), "0.0.2", ARCH)).toBeNull();
    expect(selectUpdate(manifest("0.0.2"), "0.0.3", ARCH)).toBeNull();
  });

  it("targets the manifest version and points at its arch ZIP + checksum", () => {
    const selection = selectUpdate(manifest("0.0.4"), "0.0.2", ARCH);

    expect(selection?.target).toEqual({
      version: "0.0.4",
      zipUrl: "https://dl/0.0.4/arm64.zip",
      zipName: "Yui-0.0.4-mac-arm64.zip",
      sha256: "a".repeat(64),
    });
    expect(selection?.release.version).toBe("0.0.4");
    expect(selection?.release.tag).toBe("v0.0.4");
    expect(selection?.release.url).toBe("https://github.com/ACAne0320/Yui/releases/tag/v0.0.4");
  });

  it("aggregates the changelog across every skipped version, newest first", () => {
    const notes = selectUpdate(manifest("0.0.4"), "0.0.1", ARCH)?.release.notes ?? "";

    expect(notes).toBe(
      "## v0.0.4\n\nnotes for 0.0.4\n\n## v0.0.3\n\nnotes for 0.0.3\n\n## v0.0.2\n\nnotes for 0.0.2",
    );
    // The user's own version (0.0.1) is excluded from the changelog.
    expect(notes).not.toContain("notes for 0.0.1");
  });

  it("re-sorts manifest versions and excludes any newer than the target", () => {
    const out = manifest("0.0.3", {
      versions: [
        { version: "0.0.2", notes: "notes for 0.0.2" },
        { version: "0.0.5", notes: "future leak" },
        { version: "0.0.3", notes: "notes for 0.0.3" },
      ],
    });
    const notes = selectUpdate(out, "0.0.1", ARCH)?.release.notes ?? "";

    expect(notes).toBe("## v0.0.3\n\nnotes for 0.0.3\n\n## v0.0.2\n\nnotes for 0.0.2");
    expect(notes).not.toContain("future leak");
  });

  it("falls back to the sole asset when no entry matches the running arch", () => {
    const out = manifest("0.0.3", {
      assets: {
        x64: { zipName: "Yui-0.0.3-mac-x64.zip", zipUrl: "https://dl/0.0.3/x64.zip", sha256: null },
      },
    });
    expect(selectUpdate(out, "0.0.2", "arm64")?.target.zipName).toBe("Yui-0.0.3-mac-x64.zip");
  });

  it("picks the matching arch when several are present", () => {
    const out = manifest("0.0.3", {
      assets: {
        arm64: {
          zipName: "Yui-0.0.3-mac-arm64.zip",
          zipUrl: "https://dl/0.0.3/arm64.zip",
          sha256: null,
        },
        x64: { zipName: "Yui-0.0.3-mac-x64.zip", zipUrl: "https://dl/0.0.3/x64.zip", sha256: null },
      },
    });
    expect(selectUpdate(out, "0.0.2", "x64")?.target.zipName).toBe("Yui-0.0.3-mac-x64.zip");
  });

  it("returns null when no asset applies to the running arch", () => {
    const out = manifest("0.0.3", {
      assets: {
        arm64: {
          zipName: "Yui-0.0.3-mac-arm64.zip",
          zipUrl: "https://dl/0.0.3/arm64.zip",
          sha256: null,
        },
        x64: { zipName: "Yui-0.0.3-mac-x64.zip", zipUrl: "https://dl/0.0.3/x64.zip", sha256: null },
      },
    });
    expect(selectUpdate(out, "0.0.2", "riscv64")).toBeNull();
  });

  it("carries a null checksum through when the manifest omits it", () => {
    const out = manifest("0.0.3", {
      assets: {
        arm64: {
          zipName: "Yui-0.0.3-mac-arm64.zip",
          zipUrl: "https://dl/0.0.3/arm64.zip",
          sha256: null,
        },
      },
    });
    expect(selectUpdate(out, "0.0.2", ARCH)?.target.sha256).toBeNull();
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
