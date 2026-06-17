import {
  type AppRuntime,
  setDefaultModelInputSchema,
  setDefaultThinkingLevelInputSchema,
} from "@yui/contracts";
import { desktopIpcChannels } from "../../shared/ipc-channels";
import type { IpcRegistrar } from "./handler";

export function registerSettingsIpc(registrar: IpcRegistrar, runtime: AppRuntime): void {
  registrar.handle(desktopIpcChannels.settings.getDefaults, () => runtime.settings.getDefaults());
  registrar.handleInput(
    desktopIpcChannels.settings.setDefaultModel,
    setDefaultModelInputSchema,
    (_event, input) => runtime.settings.setDefaultModel(input),
  );
  registrar.handleInput(
    desktopIpcChannels.settings.setDefaultThinkingLevel,
    setDefaultThinkingLevelInputSchema,
    (_event, input) => runtime.settings.setDefaultThinkingLevel(input),
  );
}
