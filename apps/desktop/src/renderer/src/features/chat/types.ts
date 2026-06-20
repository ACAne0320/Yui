import type { AppMessage, AppModel, ExtensionUiSnapshot, ThinkingLevel } from "@yui/contracts";

export interface ActiveConversation {
  sessionId?: string;
  sessionPath?: string;
  title: string;
  cwd: string;
  model?: { providerId: string; modelId: string };
  thinkingLevel: ThinkingLevel;
}

/**
 * A draft image attachment held in the composer before sending. `base64` is the
 * payload sent to the runtime; `objectUrl` backs the local preview thumbnail and
 * is revoked when the attachment is removed or the draft is sent.
 */
export interface ComposerAttachment {
  id: string;
  name: string;
  mimeType: string;
  base64: string;
  objectUrl: string;
}

export interface LiveTool {
  toolCallId: string;
  name: string;
  args: unknown;
  result?: unknown;
  isError?: boolean;
  running: boolean;
}

export interface ComposerProps {
  input: string;
  onInput: (value: string) => void;
  onSend: (override?: string) => Promise<void>;
  attachments: ComposerAttachment[];
  onAddFiles: (files: FileList | File[]) => void;
  onRemoveAttachment: (id: string) => void;
  /** Whether the selected model accepts image input (gates the attach affordances). */
  imagesSupported: boolean;
  models: AppModel[];
  selectedModelKey: string;
  onModel: (key: string) => void;
  cwds: string[];
  cwd: string;
  usingTemp: boolean;
  onCwd: (cwd: string) => void;
  onBrowseCwd: () => Promise<void>;
  thinking: ThinkingLevel;
  onThinking: (level: ThinkingLevel) => void;
  enabledTools: Set<string>;
  onToggleTool: (id: string) => void;
  /** New-chat toggle: open the next session without persona memory. */
  noMemory: boolean;
  onToggleNoMemory: () => void;
  locked?: boolean;
  busy?: boolean;
  onAbort?: () => Promise<void>;
}

export interface MessageStats {
  /** agent_start → agent_end, including all model requests and tool calls. */
  runMs?: number;
}

export interface RunTiming {
  runStartedAt?: number;
}

export interface ChatRealtimeState {
  active: ActiveConversation | null;
  titlePending: boolean;
  titleRevealKey: number;
  messages: AppMessage[];
  liveTools: LiveTool[];
  busy: boolean;
  queue: string[];
  pendingUserId: string | null;
  activity:
    | { type: "compacting" }
    | { type: "retrying"; attempt: number; maxAttempts: number }
    | null;
  /**
   * Extension UI slots for the active session: pending dialogs (FIFO), status
   * chips, widgets, working message, and window title. Seeded from
   * `getExtensionUiState` when a thread opens, then updated by events.
   */
  extensionUi: ExtensionUiSnapshot;
  /**
   * Live-measured run durations keyed by the final assistant message id.
   * Reloaded history derives the same value from persisted message timestamps.
   */
  messageStats: Record<string, MessageStats>;
  runTiming: RunTiming;
}

export function emptyExtensionUi(): ExtensionUiSnapshot {
  return { pendingRequests: [], statuses: [], widgets: [] };
}
