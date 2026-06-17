// Yui-owned extension UI contracts. The runtime bridges Pi's ExtensionUIContext
// into these semantic types; renderers consume them without ever seeing Pi.

import { z } from "zod";

// --- UI requests and responses ---------------------------------------------

/**
 * An extension UI request awaiting a user answer. `expiresAt` is an absolute
 * millisecond timestamp so late subscribers can compute the remaining
 * countdown themselves.
 */
export type ExtensionUiRequest =
  | { requestId: string; kind: "select"; title: string; options: string[]; expiresAt?: number }
  | { requestId: string; kind: "confirm"; title: string; message: string; expiresAt?: number }
  | { requestId: string; kind: "input"; title: string; placeholder?: string; expiresAt?: number }
  | { requestId: string; kind: "editor"; title: string; prefill?: string };

export const respondToExtensionUiInputSchema = z.object({
  sessionId: z.string().min(1),
  requestId: z.string().min(1),
  response: z.discriminatedUnion("kind", [
    // select/input/editor answer
    z.object({ kind: z.literal("value"), value: z.string() }),
    // confirm answer
    z.object({ kind: z.literal("confirmed"), confirmed: z.boolean() }),
    z.object({ kind: z.literal("cancelled") }),
  ]),
});
export type RespondToExtensionUiInput = z.infer<typeof respondToExtensionUiInputSchema>;

/** Why a pending request was resolved by the backend before the renderer answered. */
export type ExtensionUiDismissReason = "timeout" | "aborted" | "closed";

export type ExtensionNoticeLevel = "info" | "warning" | "error";

export type ExtensionWidgetPlacement = "aboveEditor" | "belowEditor";

// --- Snapshot and extension info --------------------------------------------

/**
 * The current extension UI state of a session. Lets a late-subscribing
 * renderer restore in one shot; semantically equivalent to replaying the
 * extension events emitted so far.
 */
export interface ExtensionUiSnapshot {
  /** FIFO: the earliest pending request comes first. */
  pendingRequests: ExtensionUiRequest[];
  statuses: Array<{ key: string; text: string }>;
  widgets: Array<{ key: string; lines: string[]; placement: ExtensionWidgetPlacement }>;
  workingMessage?: string;
  title?: string;
}

export interface ExtensionInfo {
  /** Extension source identifier (file or in-package path); Pi's sourceInfo digest. */
  path: string;
  tools: Array<{ name: string; description: string }>;
  commands: Array<{ name: string; description?: string }>;
}

export interface SessionExtensionsInfo {
  extensions: ExtensionInfo[];
  errors: Array<{ path: string; error: string }>;
}
