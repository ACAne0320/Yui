import type { AppRuntime } from "@yui/contracts";
import type { BrowserWindow } from "electron";
import { registerAgentsIpc } from "./agents-ipc";
import { registerAuthIpc } from "./auth-ipc";
import { registerDesktopIpc } from "./desktop-ipc";
import { registerExtensionsIpc } from "./extensions-ipc";
import { createIpcRegistrar } from "./handler";
import { registerModelsIpc } from "./models-ipc";
import { registerPersonaIpc } from "./persona-ipc";
import { registerProfileIpc } from "./profile-ipc";
import { registerSessionsIpc } from "./sessions-ipc";
import { registerSettingsIpc } from "./settings-ipc";
import { registerSubagentsIpc } from "./subagents-ipc";
import { AgentSubscriptionRegistry } from "./subscriptions";
import { registerUpdateIpc } from "./update-ipc";
import { DesktopUpdater } from "../update/updater";

export interface RegisteredDesktopIpc {
  unregister(): void;
}

export function registerIpc(
  getMainWindow: () => BrowserWindow | null,
  runtime: AppRuntime,
): RegisteredDesktopIpc {
  const registrar = createIpcRegistrar(getMainWindow);
  const subscriptions = new AgentSubscriptionRegistry(runtime);
  const updater = new DesktopUpdater(getMainWindow);

  registerDesktopIpc(registrar, runtime);
  registerUpdateIpc(registrar, updater);
  registerProfileIpc(registrar, runtime);
  registerAuthIpc(registrar, runtime);
  registerModelsIpc(registrar, runtime);
  registerSettingsIpc(registrar, runtime);
  registerPersonaIpc(registrar, runtime);
  registerSubagentsIpc(registrar, runtime);
  registerExtensionsIpc(registrar, runtime);
  registerSessionsIpc(registrar, runtime);
  registerAgentsIpc(registrar, runtime, subscriptions);

  return {
    unregister() {
      registrar.unregister();
      subscriptions.dispose();
    },
  };
}
