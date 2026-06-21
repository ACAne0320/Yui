// Pure update-selection logic, deliberately free of any Electron imports so it
// can be unit-tested without mocking `app`/`net`. The updater does the I/O
// (fetch `latest.json`) and hands the parsed manifest here.
//
// The manifest replaces the GitHub releases API as the update source: the API
// is rate-limited to 60 req/h per IP, which shared proxy exit IPs exhaust, so
// proxied users could never see updates. `latest.json` is a release asset
// served from GitHub's CDN (no API rate limit) — see {@link UpdateManifest}.

import type { UpdateRelease } from "../../shared/update-api.ts";

// One published version's changelog. The manifest carries every released
// version so a far-behind user still gets the full aggregated changelog.
export interface ManifestVersion {
  // Semantic version core without the leading "v" (e.g. "0.1.0").
  version: string;
  // Release notes in Markdown for this version.
  notes: string;
}

// A single architecture's downloadable artifact.
export interface ManifestAsset {
  // The ZIP filename (e.g. "Yui-0.1.0-mac-arm64.zip").
  zipName: string;
  // Absolute download URL (GitHub CDN), used as-is by the updater.
  zipUrl: string;
  // Expected SHA-256 hex, or null when the build omitted checksums.
  sha256: string | null;
}

/**
 * The static `latest.json` manifest published as a release asset and fetched
 * from the stable `releases/latest/download/latest.json` redirect. Generated at
 * release time by `scripts/build-update-manifest.mjs`.
 */
export interface UpdateManifest {
  // The latest stable version, without the leading "v".
  version: string;
  // The git tag as published (e.g. "v0.1.0").
  tag: string;
  // ISO-8601 publish timestamp, or null.
  publishedAt: string | null;
  // The release's GitHub page, used for the "view on GitHub" fallback.
  url: string;
  // ZIP artifact keyed by architecture ("arm64" | "x64"). A single-arch release
  // lists only the arch it built.
  assets: Record<string, ManifestAsset>;
  // Every released version's notes, so the changelog can be aggregated across
  // versions the user skipped. Order is not assumed; selection re-sorts.
  versions: ManifestVersion[];
}

// The concrete artifact a selection points at, kept out of the renderer-facing
// DTO because the URL and checksum are install-time details.
export interface DownloadTarget {
  version: string;
  zipUrl: string;
  zipName: string;
  // Expected SHA-256 hex, or null when the manifest omits it.
  sha256: string | null;
}

export interface UpdateSelection {
  // What to download and swap in.
  target: DownloadTarget;
  // What to show in the dialog (version label + aggregated changelog).
  release: UpdateRelease;
}

/**
 * Choose the upgrade target from the manifest and build the changelog to
 * display. The target is the manifest's latest version when it ships an
 * installable ZIP for `arch` and is newer than `currentVersion`; otherwise null
 * (nothing newer, or no artifact this arch can apply).
 *
 * The displayed notes aggregate every version the user skipped — the
 * `(currentVersion, manifest.version]` range, newest first — so jumping several
 * versions still shows the full changelog rather than only the latest entry.
 */
export function selectUpdate(
  manifest: UpdateManifest,
  currentVersion: string,
  arch: string,
): UpdateSelection | null {
  if (!isNewerVersion(manifest.version, currentVersion)) {
    return null;
  }

  const asset = pickAsset(manifest.assets, arch);
  if (!asset) {
    return null;
  }

  const notes = manifest.versions
    .filter(
      (entry) =>
        isNewerVersion(entry.version, currentVersion) &&
        !isNewerVersion(entry.version, manifest.version),
    )
    .toSorted((a, b) => compareVersions(b.version, a.version))
    .map((entry) => {
      const heading = `## v${entry.version}`;
      const body = entry.notes.trim();
      return body ? `${heading}\n\n${body}` : heading;
    })
    .join("\n\n");

  return {
    target: {
      version: manifest.version,
      zipUrl: asset.zipUrl,
      zipName: asset.zipName,
      sha256: asset.sha256,
    },
    release: {
      version: manifest.version,
      tag: manifest.tag,
      notes,
      publishedAt: manifest.publishedAt,
      url: manifest.url,
    },
  };
}

// Prefer the artifact matching the running architecture; fall back to the sole
// asset for single-arch releases that don't key it under the running arch.
export function pickAsset(
  assets: Record<string, ManifestAsset>,
  arch: string,
): ManifestAsset | null {
  const exact = assets[arch];
  if (exact) {
    return exact;
  }
  const values = Object.values(assets);
  return values.length === 1 ? values[0]! : null;
}

export function stripVersionPrefix(version: string): string {
  return version.replace(/^v/, "");
}

// Compares core "major.minor.patch" only; pre-release tags are out of scope for
// the unsigned channel (prereleases never enter the manifest).
export function isNewerVersion(latest: string, current: string): boolean {
  return compareVersions(latest, current) > 0;
}

// -1 / 0 / 1 for a < b / a === b / a > b on the version core.
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let index = 0; index < 3; index += 1) {
    if (left[index]! > right[index]!) {
      return 1;
    }
    if (left[index]! < right[index]!) {
      return -1;
    }
  }
  return 0;
}

function parseVersion(version: string): [number, number, number] {
  const core = stripVersionPrefix(version).split("-")[0] ?? "";
  const parts = core.split(".").map((part) => Number.parseInt(part, 10) || 0);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}
