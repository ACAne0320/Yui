import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { AppRuntimeError, type AppRuntime } from "@yui/contracts";
import { printJson, printSessionInfo, printSessions } from "../output/format.ts";
import { renderHistory } from "../output/render.ts";
import { reportError, withRuntime } from "../runtime.ts";

export interface SessionListOptions {
  cwd?: string;
  /** List sessions across all projects rather than just the current cwd. */
  all?: boolean;
  json?: boolean;
}

export async function sessionList(opts: SessionListOptions): Promise<number> {
  try {
    return await withRuntime({}, async (runtime) => {
      const input = opts.all ? {} : { cwd: resolve(opts.cwd ?? process.cwd()) };
      const sessions = await runtime.sessions.list(input);
      if (opts.json) printJson(sessions);
      else printSessions(sessions);
      return 0;
    });
  } catch (error) {
    return reportError(error);
  }
}

export async function sessionShow(
  ref: string,
  opts: { json?: boolean; context?: boolean },
): Promise<number> {
  try {
    return await withRuntime({}, async (runtime) => {
      const sessionPath = await resolveSessionRef(runtime, ref);
      const [info, history] = await Promise.all([
        runtime.sessions.getInfo({ sessionPath }),
        // Default to the full transcript; --context shows what the model sees.
        runtime.sessions.getHistory({ sessionPath, mode: opts.context ? "context" : "transcript" }),
      ]);
      if (opts.json) {
        printJson({ info, history });
      } else {
        printSessionInfo(info);
        renderHistory(history, (chunk) => process.stdout.write(chunk));
      }
      return 0;
    });
  } catch (error) {
    return reportError(error);
  }
}

/**
 * Resolve a user-supplied session reference to a session file path. Accepts an
 * existing `.jsonl` path directly, or a session id (full or a unique prefix)
 * looked up in the catalog. Shared by `session show` and `chat --resume`.
 */
export async function resolveSessionRef(runtime: AppRuntime, ref: string): Promise<string> {
  const asPath = resolve(ref);
  if (existsSync(asPath)) return asPath;

  const sessions = await runtime.sessions.list();
  const matches = sessions.filter((s) => s.sessionId === ref || s.sessionId.startsWith(ref));
  if (matches.length === 0) {
    throw new AppRuntimeError("unknown_session", `No session matches '${ref}'.`);
  }
  if (matches.length > 1) {
    throw new AppRuntimeError(
      "unknown_session",
      `Ambiguous session id '${ref}' matches ${matches.length} sessions; use a longer prefix.`,
    );
  }
  return matches[0].sessionPath;
}
