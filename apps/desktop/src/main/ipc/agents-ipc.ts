import {
  type AppRuntime,
  generateTitleInputSchema,
  openSessionInputSchema,
  promptInputSchema,
  respondToExtensionUiInputSchema,
  sessionIdInputSchema,
  setSessionModelInputSchema,
  setSessionThinkingLevelInputSchema,
} from "@yui/contracts";
import { desktopIpcChannels } from "../../shared/ipc-channels";
import type { IpcRegistrar } from "./handler";
import type { AgentSubscriptionRegistry } from "./subscriptions";

export function registerAgentsIpc(
  registrar: IpcRegistrar,
  runtime: AppRuntime,
  subscriptions: AgentSubscriptionRegistry,
): void {
  registrar.handleInput(
    desktopIpcChannels.agents.openSession,
    openSessionInputSchema,
    (_event, input) => runtime.agents.openSession(input),
  );
  registrar.handleInput(desktopIpcChannels.agents.prompt, promptInputSchema, (_event, input) =>
    runtime.agents.prompt(input),
  );
  registrar.handleInput(desktopIpcChannels.agents.steer, promptInputSchema, (_event, input) =>
    runtime.agents.steer(input),
  );
  registrar.handleInput(desktopIpcChannels.agents.followUp, promptInputSchema, (_event, input) =>
    runtime.agents.followUp(input),
  );
  registrar.handleInput(desktopIpcChannels.agents.abort, sessionIdInputSchema, (_event, input) =>
    runtime.agents.abort(input.sessionId),
  );
  registrar.handleInput(
    desktopIpcChannels.agents.generateTitle,
    generateTitleInputSchema,
    (_event, input) => runtime.agents.generateTitle(input),
  );
  registrar.handleInput(desktopIpcChannels.agents.isBusy, sessionIdInputSchema, (_event, input) =>
    runtime.agents.isBusy(input.sessionId),
  );
  registrar.handleInput(
    desktopIpcChannels.agents.setModel,
    setSessionModelInputSchema,
    (_event, input) => runtime.agents.setSessionModel(input),
  );
  registrar.handleInput(
    desktopIpcChannels.agents.setThinkingLevel,
    setSessionThinkingLevelInputSchema,
    (_event, input) => runtime.agents.setSessionThinkingLevel(input),
  );
  registrar.handleInput(
    desktopIpcChannels.agents.closeSession,
    sessionIdInputSchema,
    async (_event, input) => {
      subscriptions.removeSession(input.sessionId);
      await runtime.agents.closeSession(input.sessionId);
    },
  );
  registrar.handleInput(desktopIpcChannels.agents.subscribe, sessionIdInputSchema, (event, input) =>
    subscriptions.subscribe(event.sender, input.sessionId),
  );
  registrar.handleInput(
    desktopIpcChannels.agents.unsubscribe,
    sessionIdInputSchema,
    (event, input) => subscriptions.unsubscribe(event.sender, input.sessionId),
  );
  registrar.handleInput(
    desktopIpcChannels.agents.respondToExtensionUi,
    respondToExtensionUiInputSchema,
    (_event, input) => runtime.agents.respondToExtensionUi(input),
  );
  registrar.handleInput(
    desktopIpcChannels.agents.getExtensionUiState,
    sessionIdInputSchema,
    (_event, input) => runtime.agents.getExtensionUiState(input.sessionId),
  );
  registrar.handleInput(
    desktopIpcChannels.agents.getExtensions,
    sessionIdInputSchema,
    (_event, input) => runtime.agents.getExtensions(input.sessionId),
  );
  registrar.handleInput(
    desktopIpcChannels.agents.reloadSession,
    sessionIdInputSchema,
    (_event, input) => runtime.agents.reloadSession(input.sessionId),
  );
}
