// Desktop-only update DTOs. This lives in the shared layer (not @yui/contracts)
// because in-app updates are an Electron-specific concern that the CLI and
// runtime never touch — same reasoning as `DesktopAppInfo` in `desktop-api.ts`.

export type UpdatePhase =
  // No check has resolved yet, or the platform/build does not support updates.
  | "idle"
  // A check is in flight.
  | "checking"
  // A newer release exists and is ready to download.
  | "available"
  // The current version is the latest.
  | "not-available"
  // The update archive is downloading (`downloadProgress` tracks 0..1).
  | "downloading"
  // The archive is downloaded and verified; ready to install on restart.
  | "downloaded"
  // The last check/download/install attempt failed (`error` holds the reason).
  | "error";

export interface UpdateRelease {
  // Semantic version without the leading "v" (e.g. "0.1.0").
  version: string;
  // The git tag as published (e.g. "v0.1.0").
  tag: string;
  // Release notes in Markdown — rendered as the changelog.
  notes: string;
  // ISO-8601 publish timestamp, or null when GitHub omits it.
  publishedAt: string | null;
  // The release's GitHub page, used for the "view on GitHub" fallback.
  url: string;
}

export interface UpdateState {
  phase: UpdatePhase;
  // The running app's version, for the "current → latest" display.
  currentVersion: string;
  // Populated once a newer release is found; otherwise null.
  latest: UpdateRelease | null;
  // 0..1 while downloading, otherwise null.
  downloadProgress: number | null;
  // A human-readable reason when `phase` is "error", otherwise null.
  error: string | null;
  // False on non-macOS or unpackaged (dev) builds, where install is a no-op.
  supported: boolean;
}

// The main process pushes the full snapshot on every transition; the renderer
// mirrors it rather than tracking deltas.
export type UpdateEvent = UpdateState;
