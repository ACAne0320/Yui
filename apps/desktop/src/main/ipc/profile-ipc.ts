import type { AppRuntime } from "@yui/contracts";
import type { DesktopProfileInfo } from "../../shared/desktop-api";
import { desktopIpcChannels } from "../../shared/ipc-channels";
import type { IpcRegistrar } from "./handler";

export function registerProfileIpc(registrar: IpcRegistrar, runtime: AppRuntime): void {
  registrar.handle(desktopIpcChannels.profile.get, (): DesktopProfileInfo => {
    return {
      config: runtime.config,
      fromEnvironment: Boolean(process.env.YUI_HOME),
    };
  });
}
