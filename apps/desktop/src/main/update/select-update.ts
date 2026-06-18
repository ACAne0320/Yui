// Pure update-selection logic, deliberately free of any Electron imports so it
// can be unit-tested without mocking `app`/`net`. The updater does the I/O
// (fetch + JSON parse) and hands the raw release listing here.

import type { UpdateRelease } from "../../shared/update-api.ts";

const CHECKSUMS_ASSET = "SHA256SUMS.txt";

// The GitHub release payload, narrowed to the fields the updater consumes.
export interface GithubAsset {
  name: string;
  browser_download_url: string;
}

export interface GithubRelease {
  tag_name: string;
  body: string | null;
  html_url: string;
  published_at: string | null;
  draft: boolean;
  prerelease: boolean;
  assets: GithubAsset[];
}

// The concrete artifacts a snapshot points at, kept out of the renderer-facing
// DTO because URLs and asset names are install-time details.
export interface DownloadTarget {
  version: string;
  zipUrl: string;
  zipName: string;
  checksumsUrl: string | null;
}

export interface UpdateSelection {
  // What to download and swap in.
  target: DownloadTarget;
  // What to show in the dialog (version label + aggregated changelog).
  release: UpdateRelease;
}

/**
 * Choose the upgrade target from a GitHub releases listing and build the
 * changelog to display. The upgrade target is the newest stable release that
 * actually ships an installable ZIP for `arch`; anything newer without one
 * can't be applied so it's ignored. Returns null when no newer target exists.
 *
 * The displayed notes aggregate every stable release the user skipped — the
 * `(currentVersion, target]` range, newest first — so jumping several versions
 * still shows the full changelog rather than only the latest entry.
 */
export function selectUpdate(
  releases: GithubRelease[],
  currentVersion: string,
  arch: string,
): UpdateSelection | null {
  // Sort by version (not the API's publish order) so a late-published patch on
  // an old line can't masquerade as the newest release.
  const stable = releases
    .filter((release) => !release.draft && !release.prerelease)
    .toSorted((a, b) => compareVersions(versionOf(b), versionOf(a)));

  const target = stable.find((release) => pickZipAsset(release.assets, arch) !== null);
  if (!target || !isNewerVersion(versionOf(target), currentVersion)) {
    return null;
  }

  const targetVersion = versionOf(target);
  const zipAsset = pickZipAsset(target.assets, arch)!;
  const checksums = target.assets.find((asset) => asset.name === CHECKSUMS_ASSET) ?? null;

  const notes = stable
    .filter(
      (release) =>
        isNewerVersion(versionOf(release), currentVersion) &&
        !isNewerVersion(versionOf(release), targetVersion),
    )
    .map((release) => {
      const heading = `## v${versionOf(release)}`;
      const body = (release.body ?? "").trim();
      return body ? `${heading}\n\n${body}` : heading;
    })
    .join("\n\n");

  return {
    target: {
      version: targetVersion,
      zipUrl: zipAsset.browser_download_url,
      zipName: zipAsset.name,
      checksumsUrl: checksums?.browser_download_url ?? null,
    },
    release: {
      version: targetVersion,
      tag: target.tag_name,
      notes,
      publishedAt: target.published_at,
      url: target.html_url,
    },
  };
}

function versionOf(release: GithubRelease): string {
  return stripVersionPrefix(release.tag_name);
}

// Prefer the archive matching the running architecture; fall back to the sole
// ZIP for single-arch releases that don't tag the filename.
export function pickZipAsset(assets: GithubAsset[], arch: string): GithubAsset | null {
  const zips = assets.filter((asset) => asset.name.endsWith(".zip"));
  return zips.find((asset) => asset.name.includes(arch)) ?? zips[0] ?? null;
}

export function stripVersionPrefix(version: string): string {
  return version.replace(/^v/, "");
}

// Compares core "major.minor.patch" only; pre-release tags are out of scope for
// the unsigned channel (prereleases are filtered before this runs).
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
