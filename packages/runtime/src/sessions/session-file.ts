// Guards against Pi's `SessionManager.open()` truncating arbitrary files.
//
// `open()` calls `setSessionFile()`, which — for any existing file that has no
// valid session header — calls `newSession()` + `_rewriteFile()`, OVERWRITING
// the file with a fresh empty session. So `yui session show notes.txt` (or a
// mistyped `--resume` path) would destroy that file. We sniff the first line and
// confirm it is a real session header before letting Pi open it.

import { closeSync, existsSync, openSync, readSync } from "node:fs";
import { AppRuntimeError } from "@yui/contracts";

// A session header line is tiny (type/version/id/timestamp/cwd). A header longer
// than this is not a session file we should touch; reading a bounded prefix also
// avoids slurping a large (possibly unrelated) file just to validate it.
const HEADER_SCAN_BYTES = 64 * 1024;

function readFirstLine(path: string): string {
  const fd = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(HEADER_SCAN_BYTES);
    const bytesRead = readSync(fd, buffer, 0, buffer.length, 0);
    const text = buffer.toString("utf8", 0, bytesRead);
    const newline = text.indexOf("\n");
    return newline === -1 ? text : text.slice(0, newline);
  } finally {
    closeSync(fd);
  }
}

/**
 * Throw `session_path_error` unless `sessionPath` exists and its first line is a
 * valid Pi session header. Callers must run this before `SessionManager.open()`.
 */
export function assertSessionFile(sessionPath: string): void {
  if (!existsSync(sessionPath)) {
    throw new AppRuntimeError("session_path_error", `Session file does not exist: ${sessionPath}`);
  }

  let header: unknown;
  try {
    header = JSON.parse(readFirstLine(sessionPath));
  } catch {
    throw new AppRuntimeError(
      "session_path_error",
      `Not a Yui session file (no session header): ${sessionPath}`,
    );
  }

  const ok =
    typeof header === "object" &&
    header !== null &&
    (header as { type?: unknown }).type === "session" &&
    typeof (header as { id?: unknown }).id === "string";
  if (!ok) {
    throw new AppRuntimeError(
      "session_path_error",
      `Not a Yui session file (no session header): ${sessionPath}`,
    );
  }
}
