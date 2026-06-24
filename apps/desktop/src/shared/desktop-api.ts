import type {
  AppAgentEvent,
  AppDefaults,
  AppMessage,
  AppModel,
  DeleteExtensionInput,
  DeleteSessionInput,
  DeleteSubagentInput,
  ExtensionCatalog,
  ExtensionPathInput,
  GenerateTitleInput,
  AppSessionInfo,
  AppSessionSummary,
  BeginOAuthLoginInput,
  ExtensionUiSnapshot,
  GetHistoryInput,
  GetSessionInfoInput,
  RenameSessionInput,
  DeleteMemoryInput,
  ListMemoryInput,
  ListSessionsInput,
  MemoryEntry,
  MemoryProject,
  OpenSessionInput,
  OpenSessionResult,
  OAuthLoginFlowInput,
  OAuthLoginState,
  PersonaConfig,
  SaveMemoryInput,
  ProviderStatus,
  PromptInput,
  RemoveApiKeyInput,
  RespondToExtensionUiInput,
  RespondToOAuthLoginInput,
  RuntimeConfig,
  SaveSubagentInput,
  SaveSoulInput,
  SessionExtensionsInfo,
  SessionIdInput,
  SetApiKeyInput,
  SetDefaultModelInput,
  SetDefaultThinkingLevelInput,
  SetExtensionEnabledInput,
  SetPersonaConfigInput,
  SetSessionModelInput,
  SetSessionThinkingLevelInput,
  SoulDoc,
  SubagentCatalog,
} from "@yui/contracts";
import type { UpdateEvent, UpdateState } from "./update-api";

export type DesktopPlatform =
  | "aix"
  | "android"
  | "cygwin"
  | "darwin"
  | "freebsd"
  | "haiku"
  | "linux"
  | "netbsd"
  | "openbsd"
  | "sunos"
  | "win32";

export interface DesktopAppInfo {
  electronVersion: string;
  platform: DesktopPlatform;
}

export interface DesktopProfileInfo {
  config: RuntimeConfig;
  fromEnvironment: boolean;
}

export interface SelectDirectoryInput {
  // Where the native picker opens initially (typically the current cwd).
  defaultPath?: string;
}

export interface OpenPathInput {
  path: string;
}

export interface YuiDesktopApi {
  desktop: {
    getAppInfo(): Promise<DesktopAppInfo>;
    // Opens a native directory picker. Resolves to the chosen absolute path,
    // or `null` if the user cancels.
    selectDirectory(input?: SelectDirectoryInput): Promise<string | null>;
    // Creates a fresh throwaway workspace under the OS temp dir and resolves to
    // its absolute path. Used as the working directory when the user starts a
    // conversation without picking one. Never auto-deleted.
    createScratchDirectory(): Promise<string>;
    // Opens a path with the OS default handler (a directory opens in the file
    // manager). Resolves to an empty string on success, or an error message.
    openPath(input: OpenPathInput): Promise<string>;
  };
  update: {
    // Returns the last known update snapshot without triggering a check.
    getState(): Promise<UpdateState>;
    // Queries GitHub for the latest release and updates the snapshot.
    check(): Promise<UpdateState>;
    // Downloads and verifies the update archive for the running architecture.
    download(): Promise<UpdateState>;
    // Swaps the app bundle and relaunches. The renderer should not expect this
    // to resolve — the process quits as part of installing.
    install(): Promise<void>;
    // Subscribes to update state transitions pushed from the main process.
    onEvent(listener: (event: UpdateEvent) => void): () => void;
  };
  profile: {
    get(): Promise<DesktopProfileInfo>;
  };
  auth: {
    listProviders(): Promise<ProviderStatus[]>;
    setApiKey(input: SetApiKeyInput): Promise<void>;
    removeApiKey(input: RemoveApiKeyInput): Promise<void>;
    beginOAuthLogin(input: BeginOAuthLoginInput): Promise<OAuthLoginState>;
    getOAuthLoginState(input: OAuthLoginFlowInput): Promise<OAuthLoginState>;
    respondToOAuthLogin(input: RespondToOAuthLoginInput): Promise<void>;
    cancelOAuthLogin(input: OAuthLoginFlowInput): Promise<void>;
  };
  models: {
    listAvailable(): Promise<AppModel[]>;
  };
  settings: {
    getDefaults(): Promise<AppDefaults>;
    setDefaultModel(input: SetDefaultModelInput): Promise<void>;
    setDefaultThinkingLevel(input: SetDefaultThinkingLevelInput): Promise<void>;
  };
  persona: {
    getConfig(): Promise<PersonaConfig>;
    setConfig(input: SetPersonaConfigInput): Promise<PersonaConfig>;
    getSoul(): Promise<SoulDoc>;
    saveSoul(input: SaveSoulInput): Promise<SoulDoc>;
    listMemory(input: ListMemoryInput): Promise<MemoryEntry[]>;
    listMemoryProjects(): Promise<MemoryProject[]>;
    saveMemory(input: SaveMemoryInput): Promise<MemoryEntry>;
    deleteMemory(input: DeleteMemoryInput): Promise<void>;
  };
  subagents: {
    list(): Promise<SubagentCatalog>;
    save(input: SaveSubagentInput): Promise<void>;
    delete(input: DeleteSubagentInput): Promise<void>;
  };
  extensions: {
    list(): Promise<ExtensionCatalog>;
    setEnabled(input: SetExtensionEnabledInput): Promise<void>;
    delete(input: DeleteExtensionInput): Promise<void>;
    addPath(input: ExtensionPathInput): Promise<void>;
    removePath(input: ExtensionPathInput): Promise<void>;
  };
  sessions: {
    list(input?: ListSessionsInput): Promise<AppSessionSummary[]>;
    getInfo(input: GetSessionInfoInput): Promise<AppSessionInfo>;
    getHistory(input: GetHistoryInput): Promise<AppMessage[]>;
    delete(input: DeleteSessionInput): Promise<void>;
    rename(input: RenameSessionInput): Promise<void>;
  };
  agents: {
    openSession(input: OpenSessionInput): Promise<OpenSessionResult>;
    prompt(input: PromptInput): Promise<void>;
    steer(input: PromptInput): Promise<void>;
    followUp(input: PromptInput): Promise<void>;
    abort(input: SessionIdInput): Promise<void>;
    generateTitle(input: GenerateTitleInput): Promise<string>;
    isBusy(input: SessionIdInput): Promise<boolean>;
    setModel(input: SetSessionModelInput): Promise<void>;
    setThinkingLevel(input: SetSessionThinkingLevelInput): Promise<void>;
    closeSession(input: SessionIdInput): Promise<void>;
    subscribe(input: SessionIdInput): Promise<void>;
    unsubscribe(input: SessionIdInput): Promise<void>;
    onEvent(listener: (event: AppAgentEvent) => void): () => void;
    respondToExtensionUi(input: RespondToExtensionUiInput): Promise<void>;
    getExtensionUiState(input: SessionIdInput): Promise<ExtensionUiSnapshot>;
    getExtensions(input: SessionIdInput): Promise<SessionExtensionsInfo>;
  };
}
