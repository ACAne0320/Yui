export const desktopIpcChannels = {
  desktop: {
    getAppInfo: "desktop:get-app-info",
    selectDirectory: "desktop:select-directory",
    createScratchDirectory: "desktop:create-scratch-directory",
    openPath: "desktop:open-path",
  },
  update: {
    getState: "update:get-state",
    check: "update:check",
    download: "update:download",
    install: "update:install",
    event: "update:event",
  },
  profile: {
    get: "profile:get",
  },
  auth: {
    listProviders: "auth:list-providers",
    setApiKey: "auth:set-api-key",
    removeApiKey: "auth:remove-api-key",
    beginOAuthLogin: "auth:begin-oauth-login",
    getOAuthLoginState: "auth:get-oauth-login-state",
    respondToOAuthLogin: "auth:respond-to-oauth-login",
    cancelOAuthLogin: "auth:cancel-oauth-login",
  },
  models: {
    listAvailable: "models:list-available",
  },
  settings: {
    getDefaults: "settings:get-defaults",
    setDefaultModel: "settings:set-default-model",
    setDefaultThinkingLevel: "settings:set-default-thinking-level",
  },
  persona: {
    getConfig: "persona:get-config",
    setConfig: "persona:set-config",
    getSoul: "persona:get-soul",
    saveSoul: "persona:save-soul",
    listMemory: "persona:list-memory",
    listMemoryProjects: "persona:list-memory-projects",
    saveMemory: "persona:save-memory",
    deleteMemory: "persona:delete-memory",
  },
  subagents: {
    list: "subagents:list",
    save: "subagents:save",
    delete: "subagents:delete",
  },
  extensions: {
    list: "extensions:list",
    setEnabled: "extensions:set-enabled",
    delete: "extensions:delete",
    addPath: "extensions:add-path",
    removePath: "extensions:remove-path",
  },
  sessions: {
    list: "sessions:list",
    getInfo: "sessions:get-info",
    getHistory: "sessions:get-history",
    delete: "sessions:delete",
    rename: "sessions:rename",
  },
  agents: {
    openSession: "agents:open-session",
    prompt: "agents:prompt",
    steer: "agents:steer",
    followUp: "agents:follow-up",
    abort: "agents:abort",
    generateTitle: "agents:generate-title",
    isBusy: "agents:is-busy",
    setModel: "agents:set-model",
    setThinkingLevel: "agents:set-thinking-level",
    closeSession: "agents:close-session",
    subscribe: "agents:subscribe",
    unsubscribe: "agents:unsubscribe",
    event: "agents:event",
    respondToExtensionUi: "agents:respond-to-extension-ui",
    getExtensionUiState: "agents:get-extension-ui-state",
    getExtensions: "agents:get-extensions",
  },
} as const;

type NestedValue<T> = T extends string ? T : { [K in keyof T]: NestedValue<T[K]> }[keyof T];

export type DesktopIpcChannel = NestedValue<typeof desktopIpcChannels>;
