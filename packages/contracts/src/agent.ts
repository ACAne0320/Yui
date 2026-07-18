// Yui-owned agent contracts. These types are Pi-independent and serializable;
// no `@earendil-works/pi-*` import may appear in this package.

import { z } from "zod";
import type {
  ExtensionNoticeLevel,
  ExtensionUiDismissReason,
  ExtensionUiRequest,
  ExtensionWidgetPlacement,
} from "./extensions.ts";
import { thinkingLevelSchema, type ThinkingLevel } from "./models.ts";
import { openSessionPersonaInputSchema } from "./persona.ts";

export type AppStopReason = "stop" | "length" | "toolUse" | "error" | "aborted";

// --- Session and prompt inputs (validated at the boundary) ----------------

export const openSessionInputSchema = z.object({
  cwd: z.string().min(1),
  /** Reopen an existing Pi session JSONL; omit to create a new session. */
  sessionPath: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  thinkingLevel: thinkingLevelSchema.optional(),
  persona: openSessionPersonaInputSchema.optional(),
});
export type OpenSessionInput = z.infer<typeof openSessionInputSchema>;

/** The provider/model a session is bound to. */
export interface AppSessionModel {
  providerId: string;
  modelId: string;
}

export interface OpenSessionResult {
  sessionId: string;
  sessionPath?: string;
  /**
   * The authoritative working directory the session is bound to. For a reopened
   * session this is the cwd recorded in the session header, which may differ
   * from the caller's cwd; settings/AGENTS.md discovery uses this value.
   */
  cwd: string;
  /**
   * The model the session resolved to. Undefined only when no model could be
   * selected (e.g. no provider is configured yet). Callers do not have to pass
   * a model on open — Pi resolves one from the session, settings default, or
   * first-available — so this reports what was actually chosen.
   */
  model?: AppSessionModel;
  /** The resolved thinking level (defaults apply when not requested). */
  thinkingLevel: ThinkingLevel;
}

// --- Session catalog (cold, file-backed listing + history) -----------------

export const listSessionsInputSchema = z.object({
  /** Restrict to sessions whose header cwd matches; omit to list all. */
  cwd: z.string().optional(),
});
export type ListSessionsInput = z.infer<typeof listSessionsInputSchema>;

/**
 * "transcript" (default): the verbatim conversation along the active branch,
 * including messages a later compaction summarized away. "context": what the
 * model is restored with — compaction folded into a summary, superseded early
 * messages dropped.
 */
export const sessionHistoryModeSchema = z.enum(["transcript", "context"]);
export type SessionHistoryMode = z.infer<typeof sessionHistoryModeSchema>;

export const getHistoryInputSchema = z.object({
  sessionPath: z.string().min(1),
  mode: sessionHistoryModeSchema.optional(),
});
export type GetHistoryInput = z.infer<typeof getHistoryInputSchema>;

export const getSessionInfoInputSchema = z.object({
  sessionPath: z.string().min(1),
});
export type GetSessionInfoInput = z.infer<typeof getSessionInfoInputSchema>;

export const deleteSessionInputSchema = z.object({
  sessionPath: z.string().min(1),
});
export type DeleteSessionInput = z.infer<typeof deleteSessionInputSchema>;

export const renameSessionInputSchema = z.object({
  sessionPath: z.string().min(1),
  /** New display name; trimmed and bounded so a stray value cannot bloat the log. */
  title: z.string().trim().min(1).max(200),
});
export type RenameSessionInput = z.infer<typeof renameSessionInputSchema>;

/** A persisted session as seen from the catalog, without loading full history. */
export interface AppSessionSummary {
  sessionId: string;
  sessionPath: string;
  cwd: string;
  /** Display title: the user-set session name, else the first user message. */
  title: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Full parameters of a persisted session, read from its JSONL. Reports the
 * model and thinking level the session last used, so a user (or UI) can see
 * what a given session is configured with rather than guessing.
 */
export interface AppSessionInfo extends AppSessionSummary {
  model?: AppSessionModel;
  thinkingLevel: ThinkingLevel;
}

/**
 * An image attachment on an outbound user message. `data` is base64 (no
 * `data:` URL prefix); Pi handles per-provider encoding. Same shape as Pi's
 * `ImageContent`, so the runtime forwards it without remapping.
 */
export const imageContentSchema = z.object({
  type: z.literal("image"),
  data: z.string().min(1),
  mimeType: z.string().min(1),
});
export type ImageContentInput = z.infer<typeof imageContentSchema>;

export const promptInputSchema = z.object({
  sessionId: z.string().min(1),
  text: z.string().min(1),
  /** Optional image attachments sent alongside the text. */
  images: z.array(imageContentSchema).optional(),
});
export type PromptInput = z.infer<typeof promptInputSchema>;

export const sessionIdInputSchema = z.object({
  sessionId: z.string().min(1),
});
export type SessionIdInput = z.infer<typeof sessionIdInputSchema>;

/** Change the model on a live session; applies from the next turn. */
export const setSessionModelInputSchema = z.object({
  sessionId: z.string().min(1),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
});
export type SetSessionModelInput = z.infer<typeof setSessionModelInputSchema>;

/** Change the thinking level on a live session. */
export const setSessionThinkingLevelInputSchema = z.object({
  sessionId: z.string().min(1),
  thinkingLevel: thinkingLevelSchema,
});
export type SetSessionThinkingLevelInput = z.infer<typeof setSessionThinkingLevelInputSchema>;

export const generateTitleInputSchema = z.object({
  sessionId: z.string().min(1),
  /**
   * The opening user message, passed by the caller so titling does not race the
   * runtime persisting it. When omitted, the active session's first user message
   * is used instead.
   */
  firstMessage: z.string().optional(),
});
export type GenerateTitleInput = z.infer<typeof generateTitleInputSchema>;

export type AppContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string; redacted?: boolean }
  | { type: "toolCall"; id: string; name: string; arguments: Record<string, unknown> }
  // Binary image data is never inlined into events. `attachmentId` is a
  // content-addressed reference (sha256 of the image bytes); the renderer loads
  // the bytes out-of-band via the `yui-attachment://` protocol.
  | { type: "image"; mimeType: string; attachmentId: string };

export interface AppUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}

export type AppMessageRole =
  | "user"
  | "assistant"
  | "toolResult"
  // Coding-agent message kinds that appear in session history (Pi renders each
  // with its own label); the runtime maps them faithfully rather than blank.
  | "custom"
  | "compactionSummary"
  | "branchSummary"
  | "bashExecution";

export interface AppMessage {
  /**
   * Synthetic, runtime-assigned id. Pi message objects carry no stable id, so
   * the runtime assigns one per message and threads it through the
   * message_start -> message_update -> message_end sequence.
   */
  id: string;
  role: AppMessageRole;
  content: AppContentBlock[];
  providerId?: string;
  model?: string;
  stopReason?: AppStopReason;
  usage?: AppUsage;
  errorMessage?: string;
  /**
   * When a persisted message entry was written to the session file. Assistant
   * `timestamp` marks the request start, while this marks completion and lets
   * history views recover an end-to-end run duration.
   */
  completedAt?: number;
  timestamp: number;
  // Tool-result-specific fields, present when role === "toolResult".
  toolCallId?: string;
  toolName?: string;
  /**
   * The tool's structured `details` payload (plain JSON), persisted by Pi in
   * session history. Lets rich tool renderings (e.g. subagent task cards)
   * survive completion and session reload instead of degrading to text.
   */
  toolDetails?: unknown;
  // True for a failed tool result, or a bashExecution that errored/was cancelled.
  isError?: boolean;
  // Role-specific labels/metadata mirroring Pi's display:
  /** `custom`: the extension-defined type, shown as the `[customType]` label. */
  customType?: string;
  /** `compactionSummary`: token count before compaction, for the label. */
  tokensBefore?: number;
  /** `bashExecution`: the executed command (rendered as `$ command`). */
  command?: string;
  /** `bashExecution`: process exit code, when it completed. */
  exitCode?: number;
}

/**
 * Incremental stream within a single assistant message, unwrapped from Pi's
 * `message_update.assistantMessageEvent`. Only the nine content-level variants
 * are reachable: Pi delivers the stream's `start` as `message_start` and its
 * `done`/`error` as `message_end`, so completion and error are represented by
 * the `message_end` AppAgentEvent (with `stopReason`/`errorMessage`), not here.
 */
export type AppStreamEvent =
  | { kind: "text_start"; contentIndex: number }
  | { kind: "text_delta"; contentIndex: number; delta: string }
  | { kind: "text_end"; contentIndex: number; content: string }
  | { kind: "thinking_start"; contentIndex: number }
  | { kind: "thinking_delta"; contentIndex: number; delta: string }
  | { kind: "thinking_end"; contentIndex: number; content: string }
  | { kind: "toolcall_start"; contentIndex: number }
  | { kind: "toolcall_delta"; contentIndex: number; delta: string }
  | { kind: "toolcall_end"; contentIndex: number; toolCallId: string };

export type CompactionReason = "manual" | "threshold" | "overflow";

export type AppAgentEvent =
  // Run lifecycle
  | { type: "agent_start"; sessionId: string }
  | { type: "turn_start"; sessionId: string }
  | { type: "turn_end"; sessionId: string; message: AppMessage; toolResults: AppMessage[] }
  | { type: "agent_end"; sessionId: string; willRetry: boolean }
  /**
   * The run is fully settled: the final agent_end has fired and any pending
   * retries/compaction follow-up have completed. Fires after agent_end; use it
   * as the authoritative "no more work will happen on this session" signal.
   */
  | { type: "agent_settled"; sessionId: string }
  // Message lifecycle (full Yui-owned snapshots)
  | { type: "message_start"; sessionId: string; message: AppMessage }
  | { type: "message_update"; sessionId: string; message: AppMessage; stream: AppStreamEvent }
  | { type: "message_end"; sessionId: string; message: AppMessage }
  // Tool execution
  | {
      type: "tool_execution_start";
      sessionId: string;
      toolCallId: string;
      toolName: string;
      args: unknown;
    }
  | {
      type: "tool_execution_update";
      sessionId: string;
      toolCallId: string;
      toolName: string;
      partialResult: unknown;
    }
  | {
      type: "tool_execution_end";
      sessionId: string;
      toolCallId: string;
      toolName: string;
      result: unknown;
      isError: boolean;
    }
  // Session-level status
  | { type: "queue_update"; sessionId: string; steering: string[]; followUp: string[] }
  | { type: "compaction_start"; sessionId: string; reason: CompactionReason }
  | {
      type: "compaction_end";
      sessionId: string;
      reason: CompactionReason;
      aborted: boolean;
      willRetry: boolean;
      errorMessage?: string;
      /** Context tokens before compaction, when Pi reports a result. */
      tokensBefore?: number;
      /** Estimated context tokens after compaction, when Pi reports a result. */
      estimatedTokensAfter?: number;
    }
  | { type: "session_info_changed"; sessionId: string; name?: string }
  | { type: "thinking_level_changed"; sessionId: string; level: ThinkingLevel }
  | {
      type: "auto_retry_start";
      sessionId: string;
      attempt: number;
      maxAttempts: number;
      delayMs: number;
      errorMessage: string;
    }
  | {
      type: "auto_retry_end";
      sessionId: string;
      success: boolean;
      attempt: number;
      finalError?: string;
    }
  // Extension UI (semantic events bridged from Pi's ExtensionUIContext)
  | { type: "extension_ui_request"; sessionId: string; request: ExtensionUiRequest }
  /**
   * The request was resolved by the backend (timeout / programmatic abort /
   * session close) before the renderer answered; the renderer must close the
   * corresponding dialog.
   */
  | {
      type: "extension_ui_dismiss";
      sessionId: string;
      requestId: string;
      reason: ExtensionUiDismissReason;
    }
  | { type: "extension_notice"; sessionId: string; message: string; level: ExtensionNoticeLevel }
  | { type: "extension_status_changed"; sessionId: string; key: string; text?: string }
  | {
      type: "extension_widget_changed";
      sessionId: string;
      key: string;
      lines?: string[];
      placement: ExtensionWidgetPlacement;
    }
  | { type: "extension_title_changed"; sessionId: string; title: string }
  | { type: "extension_working_message_changed"; sessionId: string; message?: string }
  | { type: "extension_editor_set_text"; sessionId: string; text: string }
  | { type: "error"; sessionId?: string; message: string };
