import { z } from "zod";
import type {
  AppAgentEvent,
  AppMessage,
  AppSessionInfo,
  AppSessionSummary,
  DeleteSessionInput,
  GetHistoryInput,
  GetSessionInfoInput,
  ListSessionsInput,
  GenerateTitleInput,
  RenameSessionInput,
  OpenSessionInput,
  OpenSessionResult,
  PromptInput,
  SetSessionModelInput,
  SetSessionThinkingLevelInput,
} from "./agent.ts";
import type { ProviderStatus, RemoveApiKeyInput, SetApiKeyInput } from "./auth.ts";
import type {
  BeginOAuthLoginInput,
  OAuthLoginFlowInput,
  OAuthLoginState,
  RespondToOAuthLoginInput,
} from "./auth.ts";
import type {
  DeleteExtensionInput,
  ExtensionCatalog,
  ExtensionPathInput,
  SetExtensionEnabledInput,
} from "./extension-catalog.ts";
import type {
  ExtensionUiSnapshot,
  RespondToExtensionUiInput,
  SessionExtensionsInfo,
} from "./extensions.ts";
import type { AppModel } from "./models.ts";
import type {
  AppDefaults,
  SetDefaultModelInput,
  SetDefaultThinkingLevelInput,
} from "./settings.ts";
import type {
  DeleteMemoryInput,
  ListMemoryInput,
  MemoryEntry,
  MemoryProject,
  PersonaConfig,
  SaveMemoryInput,
  SaveSoulInput,
  SetPersonaConfigInput,
  SoulDoc,
} from "./persona.ts";
import type { DeleteSubagentInput, SaveSubagentInput, SubagentCatalog } from "./subagents.ts";

// --- Runtime configuration -------------------------------------------------

export const runtimeConfigSchema = z.object({
  homeDir: z.string(),
  agentDir: z.string(),
  sessionDir: z.string(),
  cwd: z.string(),
});
export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;

// --- Errors ----------------------------------------------------------------

export const appErrorCodeSchema = z.enum([
  "invalid_input",
  "forbidden",
  "no_credentials",
  "unknown_provider",
  "unknown_model",
  "model_not_authorized",
  "invalid_models_json",
  "session_path_error",
  "invalid_cwd",
  "unknown_session",
  "session_busy",
  "aborted",
  "tool_error",
  "internal",
]);
export type AppErrorCode = z.infer<typeof appErrorCodeSchema>;

/**
 * Image bytes resolved out-of-band from a session's persisted JSONL, keyed by
 * the content-addressed `attachmentId` carried on `AppContentBlock` image
 * blocks. Consumed by the desktop `yui-attachment://` protocol handler, never
 * over renderer IPC (the bytes must not enter the renderer's JS heap as base64).
 */
export interface SessionAttachment {
  mimeType: string;
  bytes: Uint8Array;
}

/** Serializable error DTO carried across process and transport boundaries. */
export interface AppError {
  code: AppErrorCode;
  message: string;
  details?: unknown;
}

/** Thrown by runtime services; serializes to {@link AppError} via `toJSON`. */
export class AppRuntimeError extends Error {
  readonly code: AppErrorCode;
  readonly details?: unknown;

  constructor(code: AppErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppRuntimeError";
    this.code = code;
    this.details = details;
  }

  toJSON(): AppError {
    return { code: this.code, message: this.message, details: this.details };
  }
}

// --- Service interfaces ----------------------------------------------------
//
// The shared method surface that `packages/runtime` implements and that the
// CLI / desktop adapters consume. Defining it here keeps the boundary explicit
// and Pi-free; adapters depend on these interfaces, never on Pi objects.

export interface AuthService {
  setApiKey(input: SetApiKeyInput): Promise<void>;
  removeApiKey(input: RemoveApiKeyInput): Promise<void>;
  listProviders(): Promise<ProviderStatus[]>;
  beginOAuthLogin(input: BeginOAuthLoginInput): Promise<OAuthLoginState>;
  getOAuthLoginState(input: OAuthLoginFlowInput): OAuthLoginState;
  respondToOAuthLogin(input: RespondToOAuthLoginInput): void;
  cancelOAuthLogin(input: OAuthLoginFlowInput): void;
  dispose(): void;
}

export interface ModelService {
  listAvailable(): Promise<AppModel[]>;
}

/**
 * Read and write persistent defaults (global `settings.json`). Setting a model
 * default lets a user choose once rather than passing `--provider/--model` on
 * every `chat`; Pi consumes these during open-session model resolution.
 */
export interface SettingsService {
  getDefaults(): Promise<AppDefaults>;
  /** Pin the default provider/model. Rejects `unknown_model` if not in registry. */
  setDefaultModel(input: SetDefaultModelInput): Promise<void>;
  setDefaultThinkingLevel(input: SetDefaultThinkingLevelInput): Promise<void>;
}

/** Profile-level persona files under `<homeDir>/persona/`. */
export interface PersonaService {
  getConfig(): Promise<PersonaConfig>;
  setConfig(input: SetPersonaConfigInput): Promise<PersonaConfig>;
  getSoul(): Promise<SoulDoc>;
  saveSoul(input: SaveSoulInput): Promise<SoulDoc>;
  listMemory(input: ListMemoryInput): Promise<MemoryEntry[]>;
  /** Working directories that have at least one project memory. */
  listMemoryProjects(): Promise<MemoryProject[]>;
  saveMemory(input: SaveMemoryInput): Promise<MemoryEntry>;
  deleteMemory(input: DeleteMemoryInput): Promise<void>;
}

/**
 * Manage the user's global Pi extensions (`<agentDir>/extensions/`). The
 * catalog mirrors pi's discovery rules and probe-loads enabled entries to
 * report their tools, commands, and load errors. Disabling moves an entry to
 * a sibling directory pi never scans; changes apply to newly opened sessions.
 */
export interface ExtensionCatalogService {
  list(): Promise<ExtensionCatalog>;
  /** Directory entries only: park in / restore from `extensions-disabled/`. */
  setEnabled(input: SetExtensionEnabledInput): Promise<void>;
  /** Directory entries only: remove the file or package directory from disk. */
  delete(input: DeleteExtensionInput): Promise<void>;
  /** Append a path to the global settings.json `extensions` list. */
  addPath(input: ExtensionPathInput): Promise<void>;
  /** Remove a path from the global settings.json `extensions` list. */
  removePath(input: ExtensionPathInput): Promise<void>;
}

/**
 * Manage the named subagents offered by the `subagent` tool. Backed by
 * markdown files in `<agentDir>/agents/` (the files stay hand-editable and
 * shareable); builtin roles are code-defined and can only be overridden or
 * reset, never removed.
 */
export interface SubagentConfigService {
  list(): Promise<SubagentCatalog>;
  /** Create or update an agent file. Renames via `previousName`. */
  save(input: SaveSubagentInput): Promise<void>;
  /** Remove an agent file. For an overridden builtin this restores the default. */
  delete(input: DeleteSubagentInput): Promise<void>;
}

/**
 * Read-only access to persisted sessions on disk. Distinct from `AgentService`,
 * which manages live, in-memory sessions; the catalog reads cold JSONL files so
 * a desktop UI can list past conversations and render their history.
 */
export interface SessionCatalog {
  list(input?: ListSessionsInput): Promise<AppSessionSummary[]>;
  /** Read a session's parameters (model, thinking level, cwd, title) by path. */
  getInfo(input: GetSessionInfoInput): Promise<AppSessionInfo>;
  /** Resolve a session file into its conversation history (root-to-leaf path). */
  getHistory(input: GetHistoryInput): Promise<AppMessage[]>;
  /**
   * Resolve image bytes for a content-addressed `attachmentId` by scanning the
   * session JSONL at `sessionPath`. Returns `undefined` when the path is not a
   * readable session file or no image hashes to the id. Supplies the desktop
   * `yui-attachment://` handler directly; not exposed over renderer IPC.
   */
  getAttachment(sessionPath: string, attachmentId: string): Promise<SessionAttachment | undefined>;
  /** Permanently remove a session's file from disk. Irreversible. */
  delete(input: DeleteSessionInput): Promise<void>;
  /**
   * Set a session's display name, persisted as a `session_info` entry (latest
   * wins). Works on any session by path; a live session's next cold read picks
   * up the new name.
   */
  rename(input: RenameSessionInput): Promise<void>;
}

export interface AgentService {
  /** Open (or reopen) a session; one session maps to one Pi session JSONL. */
  openSession(input: OpenSessionInput): Promise<OpenSessionResult>;
  /** Start a turn on an idle session. Rejects with `session_busy` if streaming. */
  prompt(input: PromptInput): Promise<void>;
  /** Queue input while the session is streaming (interrupt + redirect). */
  steer(input: PromptInput): Promise<void>;
  /** Queue input delivered after the current run finishes. */
  followUp(input: PromptInput): Promise<void>;
  /** Cancel the in-flight turn. */
  abort(sessionId: string): Promise<void>;
  /**
   * Resolve image bytes for a content-addressed `attachmentId` from the *live*
   * session at `sessionPath` (its in-memory history), so a just-sent image
   * resolves before it is flushed to the JSONL. Returns `undefined` when no live
   * session owns that path or no image hashes to the id. Pairs with
   * {@link SessionCatalog.getAttachment} (cold fallback) behind the desktop
   * `yui-attachment://` handler; not exposed over renderer IPC.
   */
  getLiveAttachment(
    sessionPath: string,
    attachmentId: string,
  ): Promise<SessionAttachment | undefined>;
  /**
   * Generate a concise title for an active session from its opening exchange,
   * persist it as the session name, and return it. Throws if the session is not
   * active or no model/credential is available.
   */
  generateTitle(input: GenerateTitleInput): Promise<string>;
  /** Whether a turn is currently streaming for this session. */
  isBusy(sessionId: string): boolean;
  /** Change the model on a live session; takes effect from the next turn. */
  setSessionModel(input: SetSessionModelInput): Promise<void>;
  /** Change the thinking level on a live session. */
  setSessionThinkingLevel(input: SetSessionThinkingLevelInput): Promise<void>;
  closeSession(sessionId: string): Promise<void>;
  /** Per-session subscription; returns an unsubscribe function. */
  subscribe(sessionId: string, listener: (event: AppAgentEvent) => void): () => void;
  /**
   * Answer a pending extension UI request. An unknown requestId is silently
   * ignored (the request may already have resolved via timeout/abort/close).
   */
  respondToExtensionUi(input: RespondToExtensionUiInput): Promise<void>;
  /** Read the session's current extension UI state (late-subscriber restore). */
  getExtensionUiState(sessionId: string): ExtensionUiSnapshot;
  /** List the extensions loaded for a session, including load errors. */
  getExtensions(sessionId: string): SessionExtensionsInfo;
}

export interface AppRuntime {
  /** Resolved paths this runtime reads from and writes to. Serializable DTO. */
  readonly config: RuntimeConfig;
  auth: AuthService;
  models: ModelService;
  settings: SettingsService;
  persona: PersonaService;
  agents: AgentService;
  subagents: SubagentConfigService;
  extensions: ExtensionCatalogService;
  sessions: SessionCatalog;
  dispose(): Promise<void>;
}
