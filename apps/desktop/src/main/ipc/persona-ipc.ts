import {
  type AppRuntime,
  deleteMemoryInputSchema,
  listMemoryInputSchema,
  saveMemoryInputSchema,
  saveSoulInputSchema,
  setPersonaConfigInputSchema,
} from "@yui/contracts";
import { desktopIpcChannels } from "../../shared/ipc-channels";
import type { IpcRegistrar } from "./handler";

export function registerPersonaIpc(registrar: IpcRegistrar, runtime: AppRuntime): void {
  registrar.handle(desktopIpcChannels.persona.getConfig, () => runtime.persona.getConfig());
  registrar.handleInput(
    desktopIpcChannels.persona.setConfig,
    setPersonaConfigInputSchema,
    (_event, input) => runtime.persona.setConfig(input),
  );
  registrar.handle(desktopIpcChannels.persona.getSoul, () => runtime.persona.getSoul());
  registrar.handleInput(desktopIpcChannels.persona.saveSoul, saveSoulInputSchema, (_event, input) =>
    runtime.persona.saveSoul(input),
  );
  registrar.handleInput(
    desktopIpcChannels.persona.listMemory,
    listMemoryInputSchema,
    (_event, input) => runtime.persona.listMemory(input),
  );
  registrar.handleInput(
    desktopIpcChannels.persona.saveMemory,
    saveMemoryInputSchema,
    (_event, input) => runtime.persona.saveMemory(input),
  );
  registrar.handleInput(
    desktopIpcChannels.persona.deleteMemory,
    deleteMemoryInputSchema,
    (_event, input) => runtime.persona.deleteMemory(input),
  );
}
