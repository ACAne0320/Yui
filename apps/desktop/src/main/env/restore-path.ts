import { execFile } from "node:child_process";
import { delimiter } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Isolates the PATH value from anything the user's rc files might print.
const MARKER = "__YUI_PATH__";

/**
 * GUI launches on macOS/Linux (Finder/Dock) don't inherit the user's
 * login-shell PATH, so the runtime cannot see Homebrew/nvm/pyenv/cargo/... tools
 * that a terminal session would — Pi's bash tool runs with a bare
 * `/usr/bin:/bin:/usr/sbin:/sbin` and `command not found`s everything the user
 * installed. Ask the login shell for its PATH and merge it into
 * `process.env.PATH` (login-shell entries first, current entries kept as a
 * fallback). Best-effort: any failure leaves PATH untouched.
 *
 * Read `process.env.PATH` lazily downstream — Pi's `getShellEnv()` reads it at
 * each bash exec, so this only needs to run before the first agent command.
 */
export async function restoreLoginShellPath(): Promise<void> {
  if (process.platform === "win32") return;
  const shell = process.env.SHELL || "/bin/zsh";
  let loginPath: string | undefined;
  try {
    // -i (interactive) sources ~/.zshrc / ~/.bashrc; -l (login) sources
    // ~/.zprofile / ~/.profile — between them they cover wherever PATH is set
    // (Homebrew typically in the login profile, nvm/pyenv in the interactive rc).
    const { stdout } = await execFileAsync(
      shell,
      ["-ilc", `printf '${MARKER}%s${MARKER}' "$PATH"`],
      { timeout: 5000, encoding: "utf8" },
    );
    loginPath = stdout.split(MARKER)[1]?.trim();
  } catch {
    // Shell missing, slow/blocking rc file, or a shell that rejects -ilc — give
    // up and keep whatever PATH we were launched with.
  }
  const merged = mergePath(loginPath, process.env.PATH);
  if (merged) process.env.PATH = merged;
}

/** Concatenate login-shell PATH ahead of the current PATH, dropping duplicates. */
function mergePath(loginPath: string | undefined, current: string | undefined): string | undefined {
  const seen = new Set<string>();
  const deduped = [
    ...(loginPath?.split(delimiter) ?? []),
    ...(current?.split(delimiter) ?? []),
  ].filter((entry) => entry && !seen.has(entry) && seen.add(entry));
  return deduped.length ? deduped.join(delimiter) : undefined;
}
