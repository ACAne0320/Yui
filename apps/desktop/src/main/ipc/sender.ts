import { AppRuntimeError } from "@yui/contracts";
import type { BrowserWindow, WebContents } from "electron";

export function assertTrustedSender(
  sender: WebContents,
  getMainWindow: () => BrowserWindow | null,
): void {
  const mainWindow = getMainWindow();

  if (!mainWindow || mainWindow.isDestroyed() || sender !== mainWindow.webContents) {
    throw new AppRuntimeError("forbidden", "Rejected IPC request from an untrusted renderer.");
  }
}
