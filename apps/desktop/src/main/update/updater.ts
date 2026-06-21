import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants as fsConstants, createReadStream, createWriteStream } from "node:fs";
import { access, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { AppRuntimeError } from "@yui/contracts";
import { app, type BrowserWindow, net } from "electron";
import { desktopIpcChannels } from "../../shared/ipc-channels";
import type { UpdateRelease, UpdateState } from "../../shared/update-api";
import { type DownloadTarget, selectUpdate, type UpdateManifest } from "./select-update.ts";

const REPO_OWNER = "ACAne0320";
const REPO_NAME = "Yui";
// The static manifest, not the GitHub releases API. The API is rate-limited to
// 60 req/h per IP, which shared proxy exit IPs (common for our users) exhaust,
// so proxied users never saw updates. `latest.json` is a release asset served
// from GitHub's CDN via this stable redirect — no API rate limit. It also
// carries the aggregated changelog the listing used to provide.
const MANIFEST_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest/download/latest.json`;
const USER_AGENT = `Yui/${app.getVersion()} (+https://github.com/${REPO_OWNER}/${REPO_NAME})`;

/**
 * Drives the unsigned in-app update flow on macOS: check GitHub for a newer
 * release, download + checksum-verify the ZIP, then swap the `.app` bundle and
 * relaunch via a detached shell script (see {@link buildSwapScript}).
 *
 * macOS auto-update normally requires code signing because Squirrel.Mac
 * validates the new bundle's signature. We sidestep that entirely by doing the
 * swap ourselves: the ZIP is fetched by our own process (so it never gets a
 * `com.apple.quarantine` flag) and we strip quarantine before relaunch, so
 * Gatekeeper does not re-prompt. The only friction left is the one-time
 * Gatekeeper bypass on the very first DMG install.
 */
export class DesktopUpdater {
  private state: UpdateState;
  private target: DownloadTarget | null = null;
  private downloadedZipPath: string | null = null;

  constructor(private readonly getMainWindow: () => BrowserWindow | null) {
    this.state = {
      phase: "idle",
      currentVersion: app.getVersion(),
      latest: null,
      downloadProgress: null,
      error: null,
      // Unpackaged (dev) builds have no bundle to swap, and only macOS is
      // produced today, so install is a no-op everywhere else.
      supported: process.platform === "darwin" && app.isPackaged,
    };
  }

  getState(): UpdateState {
    return this.state;
  }

  async check(): Promise<UpdateState> {
    if (!this.state.supported) {
      return this.patch({ phase: "not-available" });
    }
    // A check while downloading/downloaded would clobber progress; ignore it.
    if (this.state.phase === "downloading" || this.state.phase === "downloaded") {
      return this.state;
    }

    this.patch({ phase: "checking", error: null });
    try {
      // fetchLatestRelease only returns a release when it's strictly newer.
      const release = await this.fetchLatestRelease();
      if (release) {
        return this.patch({ phase: "available", latest: release });
      }
      this.target = null;
      return this.patch({ phase: "not-available", latest: null });
    } catch (error) {
      return this.patch({ phase: "error", error: describeError(error) });
    }
  }

  async download(): Promise<UpdateState> {
    if (!this.state.supported || !this.target) {
      return this.patch({ phase: "error", error: "No update is available to download." });
    }
    if (this.state.phase === "downloading") {
      return this.state;
    }

    const target = this.target;
    this.patch({ phase: "downloading", downloadProgress: 0, error: null });
    try {
      const dir = await mkdtemp(join(tmpdir(), "yui-update-"));
      const zipPath = join(dir, target.zipName);
      await this.downloadFile(target.zipUrl, zipPath, (progress) =>
        this.patch({ downloadProgress: progress }),
      );
      if (target.sha256) {
        await verifyChecksum(zipPath, target.sha256);
      }
      this.downloadedZipPath = zipPath;
      return this.patch({ phase: "downloaded", downloadProgress: 1 });
    } catch (error) {
      return this.patch({ phase: "error", error: describeError(error) });
    }
  }

  async install(): Promise<void> {
    if (!this.state.supported || !this.downloadedZipPath) {
      throw new AppRuntimeError("internal", "No downloaded update is ready to install.");
    }

    const bundlePath = resolveAppBundlePath();
    const extractDir = await mkdtemp(join(tmpdir(), "yui-install-"));
    // `ditto` is the only macOS-native tool that round-trips an `.app` bundle's
    // symlinks and framework layout correctly — `unzip` mangles them.
    await runCommand("ditto", ["-x", "-k", this.downloadedZipPath, extractDir]);

    const newBundlePath = join(extractDir, basename(bundlePath));
    try {
      await access(newBundlePath);
    } catch {
      throw new AppRuntimeError("internal", "The downloaded update did not contain the app.");
    }

    // `mv` needs write access to the bundle's parent dir (e.g. /Applications),
    // not the bundle itself. The default admin user owns /Applications, so this
    // is usually true and no password prompt appears.
    const needsAdmin = !(await isWritable(dirname(bundlePath)));
    const scriptPath = await writeSwapScript(extractDir, {
      oldPid: process.pid,
      bundlePath,
      newBundlePath,
      needsAdmin,
    });

    // Detach so the script outlives this process, then quit to release the
    // running binary before the swap touches it.
    const child = spawn("/bin/bash", [scriptPath], { detached: true, stdio: "ignore" });
    child.unref();
    app.quit();
  }

  private async fetchLatestRelease(): Promise<UpdateRelease | null> {
    // `releases/latest/download/...` 302-redirects to the CDN; net.fetch follows
    // it. A repo with no published release yet 404s, which we treat as "no
    // update" rather than an error the user needs to see.
    const response = await net.fetch(MANIFEST_URL, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (response.status === 404) {
      this.target = null;
      return null;
    }
    if (!response.ok) {
      throw new Error(`GitHub responded ${response.status} while checking for updates.`);
    }

    const manifest = (await response.json()) as UpdateManifest;
    const selection = selectUpdate(manifest, this.state.currentVersion, process.arch);
    if (!selection) {
      this.target = null;
      return null;
    }

    this.target = selection.target;
    return selection.release;
  }

  private async downloadFile(
    url: string,
    destination: string,
    onProgress: (progress: number) => void,
  ): Promise<void> {
    const response = await net.fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!response.ok || !response.body) {
      throw new Error(`Download failed (${response.status}).`);
    }

    const total = Number(response.headers.get("content-length")) || 0;
    const file = createWriteStream(destination);
    const reader = response.body.getReader();
    let received = 0;
    // Emitting an IPC event per chunk floods the renderer; only push when the
    // whole-percent figure moves.
    let lastPercent = -1;

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        received += value.byteLength;
        await new Promise<void>((resolve, reject) => {
          file.write(value, (error) => (error ? reject(error) : resolve()));
        });
        if (total > 0) {
          const percent = Math.floor((received / total) * 100);
          if (percent !== lastPercent) {
            lastPercent = percent;
            onProgress(Math.min(received / total, 1));
          }
        }
      }
    } finally {
      await new Promise<void>((resolve) => file.end(resolve));
    }
  }

  private patch(partial: Partial<UpdateState>): UpdateState {
    this.state = { ...this.state, ...partial };
    const window = this.getMainWindow();
    if (window && !window.isDestroyed()) {
      window.webContents.send(desktopIpcChannels.update.event, this.state);
    }
    return this.state;
  }
}

// The manifest inlines the expected SHA-256, so verification is a local hash
// compare — no second network round-trip to a checksums file.
async function verifyChecksum(zipPath: string, expected: string): Promise<void> {
  const actual = await sha256File(zipPath);
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error("The downloaded update failed checksum verification.");
  }
}

function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}.`)),
    );
  });
}

// execPath is `.../Yui.app/Contents/MacOS/Yui`; trim back to the bundle root.
function resolveAppBundlePath(): string {
  const marker = process.execPath.indexOf(".app/");
  if (marker !== -1) {
    return process.execPath.slice(0, marker + ".app".length);
  }
  return dirname(dirname(dirname(process.execPath)));
}

async function isWritable(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.W_OK);
    return true;
  } catch {
    return false;
  }
}

interface SwapScriptOptions {
  oldPid: number;
  bundlePath: string;
  newBundlePath: string;
  needsAdmin: boolean;
}

async function writeSwapScript(directory: string, options: SwapScriptOptions): Promise<string> {
  const swapPath = join(directory, "swap.sh");
  const runPath = join(directory, "run-update.sh");
  await writeFile(swapPath, buildSwapScript(options), { mode: 0o755 });
  await writeFile(runPath, buildRunScript(swapPath, options), { mode: 0o755 });
  return runPath;
}

// Privileged half: strip quarantine, back up the old bundle, swap in the new
// one, and roll back if the swap fails so a broken move never leaves the user
// without an app.
function buildSwapScript(options: SwapScriptOptions): string {
  const quotedApp = shellQuote(options.bundlePath);
  const quotedNew = shellQuote(options.newBundlePath);
  return `#!/bin/bash
set -u
APP=${quotedApp}
NEW=${quotedNew}
BAK="$APP.yui-update-backup"
xattr -dr com.apple.quarantine "$NEW" 2>/dev/null || true
rm -rf "$BAK"
mv "$APP" "$BAK" || exit 1
if mv "$NEW" "$APP"; then
  rm -rf "$BAK"
else
  mv "$BAK" "$APP"
  exit 1
fi
`;
}

// Driver half: wait for the old process to exit, run the swap (elevating only
// when the install location isn't user-writable), then relaunch as the user.
// `open` runs outside the elevated block so the app never relaunches as root.
function buildRunScript(swapPath: string, options: SwapScriptOptions): string {
  const quotedSwap = shellQuote(swapPath);
  const quotedApp = shellQuote(options.bundlePath);
  const elevate = options.needsAdmin
    ? `osascript -e "do shell script \\"/bin/bash '${swapPath}'\\" with administrator privileges"`
    : `/bin/bash ${quotedSwap}`;
  return `#!/bin/bash
set -u
# Wait up to ~30s for the old Yui process to release its binary.
for _ in $(seq 1 150); do
  kill -0 ${options.oldPid} 2>/dev/null || break
  sleep 0.2
done
if ${elevate}; then
  open ${quotedApp}
fi
`;
}

// Single-quote a value for safe interpolation into a bash script.
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}
