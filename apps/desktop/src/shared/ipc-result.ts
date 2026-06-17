import type { AppError } from "@yui/contracts";

export type DesktopIpcResult<T> = { ok: true; value: T } | { ok: false; error: AppError };
