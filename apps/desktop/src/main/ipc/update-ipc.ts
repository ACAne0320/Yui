import { desktopIpcChannels } from "../../shared/ipc-channels";
import type { DesktopUpdater } from "../update/updater";
import type { IpcRegistrar } from "./handler";

export function registerUpdateIpc(registrar: IpcRegistrar, updater: DesktopUpdater): void {
  registrar.handle(desktopIpcChannels.update.getState, () => updater.getState());
  registrar.handle(desktopIpcChannels.update.check, () => updater.check());
  registrar.handle(desktopIpcChannels.update.download, () => updater.download());
  registrar.handle(desktopIpcChannels.update.install, () => updater.install());
}
