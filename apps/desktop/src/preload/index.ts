import type { AppAgentEvent } from "@yui/contracts";
import { contextBridge, ipcRenderer } from "electron";
import { createYuiApi } from "./api/create-yui-api";
import { invokeDesktop } from "./api/invoke";
import { desktopIpcChannels } from "../shared/ipc-channels";
import type { UpdateEvent } from "../shared/update-api";

const yuiApi = createYuiApi(
  invokeDesktop,
  (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, event: AppAgentEvent) => listener(event);
    ipcRenderer.on(desktopIpcChannels.agents.event, handler);
    return () => ipcRenderer.removeListener(desktopIpcChannels.agents.event, handler);
  },
  (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, event: UpdateEvent) => listener(event);
    ipcRenderer.on(desktopIpcChannels.update.event, handler);
    return () => ipcRenderer.removeListener(desktopIpcChannels.update.event, handler);
  },
);

contextBridge.exposeInMainWorld("yui", yuiApi);
