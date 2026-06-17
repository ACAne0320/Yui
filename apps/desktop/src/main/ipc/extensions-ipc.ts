import {
  type AppRuntime,
  deleteExtensionInputSchema,
  extensionPathInputSchema,
  setExtensionEnabledInputSchema,
} from "@yui/contracts";
import { desktopIpcChannels } from "../../shared/ipc-channels";
import type { IpcRegistrar } from "./handler";

export function registerExtensionsIpc(registrar: IpcRegistrar, runtime: AppRuntime): void {
  registrar.handle(desktopIpcChannels.extensions.list, () => runtime.extensions.list());
  registrar.handleInput(
    desktopIpcChannels.extensions.setEnabled,
    setExtensionEnabledInputSchema,
    (_event, input) => runtime.extensions.setEnabled(input),
  );
  registrar.handleInput(
    desktopIpcChannels.extensions.delete,
    deleteExtensionInputSchema,
    (_event, input) => runtime.extensions.delete(input),
  );
  registrar.handleInput(
    desktopIpcChannels.extensions.addPath,
    extensionPathInputSchema,
    (_event, input) => runtime.extensions.addPath(input),
  );
  registrar.handleInput(
    desktopIpcChannels.extensions.removePath,
    extensionPathInputSchema,
    (_event, input) => runtime.extensions.removePath(input),
  );
}
