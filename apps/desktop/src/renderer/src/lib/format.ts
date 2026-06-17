import type { AppErrorCode } from "@yui/contracts";
import i18n from "@renderer/i18n";

const errorKeys = {
  invalid_input: "errors.invalid_input",
  forbidden: "errors.forbidden",
  no_credentials: "errors.no_credentials",
  unknown_provider: "errors.unknown_provider",
  unknown_model: "errors.unknown_model",
  model_not_authorized: "errors.model_not_authorized",
  invalid_models_json: "errors.invalid_models_json",
  session_path_error: "errors.session_path_error",
  invalid_cwd: "errors.invalid_cwd",
  unknown_session: "errors.unknown_session",
  session_busy: "errors.session_busy",
  aborted: "errors.aborted",
  tool_error: "errors.tool_error",
  internal: "errors.internal",
} as const satisfies Record<AppErrorCode, string>;

export function formatError(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = String(error.code) as AppErrorCode;
    if (code in errorKeys) return i18n.t(errorKeys[code]);
  }
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return i18n.t("common.unknownError");
}

// Collapse the user's home directory to `~` across macOS (/Users/<name>),
// Linux (/home/<name>) and Windows (C:\Users\<name>).
const HOME_PREFIX = /^(?:\/Users\/[^/]+|\/home\/[^/]+|[A-Za-z]:\\Users\\[^\\]+)/;

export function displayPath(path: string): string {
  const home = path.match(HOME_PREFIX)?.[0];
  return home ? path.replace(home, "~") : path;
}

export function shortPath(path: string): string {
  const display = displayPath(path);
  // Split on either separator so Windows paths shorten too.
  const parts = display.split(/[/\\]/).filter(Boolean);
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : display;
}
