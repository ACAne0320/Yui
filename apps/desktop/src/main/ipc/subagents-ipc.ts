import {
  type AppRuntime,
  deleteSubagentInputSchema,
  saveSubagentInputSchema,
} from "@yui/contracts";
import { desktopIpcChannels } from "../../shared/ipc-channels";
import type { IpcRegistrar } from "./handler";

export function registerSubagentsIpc(registrar: IpcRegistrar, runtime: AppRuntime): void {
  registrar.handle(desktopIpcChannels.subagents.list, () => runtime.subagents.list());
  registrar.handleInput(
    desktopIpcChannels.subagents.save,
    saveSubagentInputSchema,
    (_event, input) => runtime.subagents.save(input),
  );
  registrar.handleInput(
    desktopIpcChannels.subagents.delete,
    deleteSubagentInputSchema,
    (_event, input) => runtime.subagents.delete(input),
  );
}
