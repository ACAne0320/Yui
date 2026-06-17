import type { AppAgentEvent } from "@yui/contracts";
import type { YuiDesktopApi } from "../../shared/desktop-api";
import { desktopIpcChannels, type DesktopIpcChannel } from "../../shared/ipc-channels";

export type DesktopInvoke = <Output>(
  channel: DesktopIpcChannel,
  input?: unknown,
) => Promise<Output>;

export type AgentEventSubscriber = (listener: (event: AppAgentEvent) => void) => () => void;

export function createYuiApi(
  invoke: DesktopInvoke,
  onAgentEvent: AgentEventSubscriber,
): YuiDesktopApi {
  return {
    desktop: {
      getAppInfo: () => invoke(desktopIpcChannels.desktop.getAppInfo),
      selectDirectory: (input) => invoke(desktopIpcChannels.desktop.selectDirectory, input),
      createScratchDirectory: () => invoke(desktopIpcChannels.desktop.createScratchDirectory),
      openPath: (input) => invoke(desktopIpcChannels.desktop.openPath, input),
    },
    profile: {
      get: () => invoke(desktopIpcChannels.profile.get),
    },
    auth: {
      listProviders: () => invoke(desktopIpcChannels.auth.listProviders),
      setApiKey: (input) => invoke(desktopIpcChannels.auth.setApiKey, input),
      removeApiKey: (input) => invoke(desktopIpcChannels.auth.removeApiKey, input),
      beginOAuthLogin: (input) => invoke(desktopIpcChannels.auth.beginOAuthLogin, input),
      getOAuthLoginState: (input) => invoke(desktopIpcChannels.auth.getOAuthLoginState, input),
      respondToOAuthLogin: (input) => invoke(desktopIpcChannels.auth.respondToOAuthLogin, input),
      cancelOAuthLogin: (input) => invoke(desktopIpcChannels.auth.cancelOAuthLogin, input),
    },
    models: {
      listAvailable: () => invoke(desktopIpcChannels.models.listAvailable),
    },
    settings: {
      getDefaults: () => invoke(desktopIpcChannels.settings.getDefaults),
      setDefaultModel: (input) => invoke(desktopIpcChannels.settings.setDefaultModel, input),
      setDefaultThinkingLevel: (input) =>
        invoke(desktopIpcChannels.settings.setDefaultThinkingLevel, input),
    },
    subagents: {
      list: () => invoke(desktopIpcChannels.subagents.list),
      save: (input) => invoke(desktopIpcChannels.subagents.save, input),
      delete: (input) => invoke(desktopIpcChannels.subagents.delete, input),
    },
    extensions: {
      list: () => invoke(desktopIpcChannels.extensions.list),
      setEnabled: (input) => invoke(desktopIpcChannels.extensions.setEnabled, input),
      delete: (input) => invoke(desktopIpcChannels.extensions.delete, input),
      addPath: (input) => invoke(desktopIpcChannels.extensions.addPath, input),
      removePath: (input) => invoke(desktopIpcChannels.extensions.removePath, input),
    },
    sessions: {
      list: (input) => invoke(desktopIpcChannels.sessions.list, input),
      getInfo: (input) => invoke(desktopIpcChannels.sessions.getInfo, input),
      getHistory: (input) => invoke(desktopIpcChannels.sessions.getHistory, input),
      delete: (input) => invoke(desktopIpcChannels.sessions.delete, input),
    },
    agents: {
      openSession: (input) => invoke(desktopIpcChannels.agents.openSession, input),
      prompt: (input) => invoke(desktopIpcChannels.agents.prompt, input),
      steer: (input) => invoke(desktopIpcChannels.agents.steer, input),
      followUp: (input) => invoke(desktopIpcChannels.agents.followUp, input),
      abort: (input) => invoke(desktopIpcChannels.agents.abort, input),
      generateTitle: (input) => invoke(desktopIpcChannels.agents.generateTitle, input),
      isBusy: (input) => invoke(desktopIpcChannels.agents.isBusy, input),
      setModel: (input) => invoke(desktopIpcChannels.agents.setModel, input),
      setThinkingLevel: (input) => invoke(desktopIpcChannels.agents.setThinkingLevel, input),
      closeSession: (input) => invoke(desktopIpcChannels.agents.closeSession, input),
      subscribe: (input) => invoke(desktopIpcChannels.agents.subscribe, input),
      unsubscribe: (input) => invoke(desktopIpcChannels.agents.unsubscribe, input),
      onEvent: onAgentEvent,
      respondToExtensionUi: (input) =>
        invoke(desktopIpcChannels.agents.respondToExtensionUi, input),
      getExtensionUiState: (input) => invoke(desktopIpcChannels.agents.getExtensionUiState, input),
      getExtensions: (input) => invoke(desktopIpcChannels.agents.getExtensions, input),
    },
  };
}
