import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import type { AppRuntime } from "@yui/contracts";
import { BrowserWindow, dialog, shell } from "electron";
import { z } from "zod";
import type { DesktopAppInfo } from "../../shared/desktop-api";
import { desktopIpcChannels } from "../../shared/ipc-channels";
import type { IpcRegistrar } from "./handler";

const selectDirectoryInputSchema = z
  .object({
    defaultPath: z.string().optional(),
  })
  .optional();

const openPathInputSchema = z.object({
  path: z.string().min(1),
});

export function registerDesktopIpc(registrar: IpcRegistrar, runtime: AppRuntime): void {
  registrar.handle(desktopIpcChannels.desktop.getAppInfo, (): DesktopAppInfo => {
    return {
      electronVersion: process.versions.electron,
      platform: process.platform,
    };
  });

  registrar.handleInput(
    desktopIpcChannels.desktop.selectDirectory,
    selectDirectoryInputSchema,
    async (event, input): Promise<string | null> => {
      const parent = BrowserWindow.fromWebContents(event.sender);
      const options: Electron.OpenDialogOptions = {
        properties: ["openDirectory", "createDirectory"],
        defaultPath: input?.defaultPath || undefined,
      };
      // Anchor the dialog to the requesting window when we can resolve it, so it
      // is modal on macOS/Windows; otherwise fall back to an app-modal dialog.
      const result = parent
        ? await dialog.showOpenDialog(parent, options)
        : await dialog.showOpenDialog(options);
      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0] ?? null;
    },
  );

  registrar.handle(desktopIpcChannels.desktop.createScratchDirectory, async (): Promise<string> => {
    // Scratch workspaces live under the profile home (`YUI_HOME/scratch`) so
    // they are co-located with the rest of the user's Yui data rather than the
    // OS temp dir, and survive until the user removes them.
    const scratchRoot = join(runtime.config.homeDir, "scratch");
    await mkdir(scratchRoot, { recursive: true });
    return mkdtemp(join(scratchRoot, "ws-"));
  });

  registrar.handleInput(
    desktopIpcChannels.desktop.openPath,
    openPathInputSchema,
    // Resolves to "" on success or an error message (shell.openPath's contract).
    (_event, input): Promise<string> => shell.openPath(input.path),
  );
}
