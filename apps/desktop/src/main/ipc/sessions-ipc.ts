import {
  type AppRuntime,
  deleteSessionInputSchema,
  getHistoryInputSchema,
  getSessionInfoInputSchema,
  listSessionsInputSchema,
  renameSessionInputSchema,
} from "@yui/contracts";
import { desktopIpcChannels } from "../../shared/ipc-channels";
import type { IpcRegistrar } from "./handler";

const optionalListSessionsInputSchema = listSessionsInputSchema.optional();

export function registerSessionsIpc(registrar: IpcRegistrar, runtime: AppRuntime): void {
  registrar.handleInput(
    desktopIpcChannels.sessions.list,
    optionalListSessionsInputSchema,
    (_event, input) => runtime.sessions.list(input),
  );
  registrar.handleInput(
    desktopIpcChannels.sessions.getInfo,
    getSessionInfoInputSchema,
    (_event, input) => runtime.sessions.getInfo(input),
  );
  registrar.handleInput(
    desktopIpcChannels.sessions.getHistory,
    getHistoryInputSchema,
    (_event, input) => runtime.sessions.getHistory(input),
  );
  registrar.handleInput(
    desktopIpcChannels.sessions.delete,
    deleteSessionInputSchema,
    (_event, input) => runtime.sessions.delete(input),
  );
  registrar.handleInput(
    desktopIpcChannels.sessions.rename,
    renameSessionInputSchema,
    (_event, input) => runtime.sessions.rename(input),
  );
}
