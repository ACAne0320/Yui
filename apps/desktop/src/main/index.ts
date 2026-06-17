import { app, nativeImage, type BrowserWindow } from "electron";
import appIcon from "../../build/icon.png?asset";
import { registerIpc, type RegisteredDesktopIpc } from "./ipc/register-ipc";
import { configureMainNetwork } from "./network/proxy";
import {
  installAttachmentProtocol,
  registerAttachmentScheme,
} from "./protocol/attachment-protocol";
import { disposeDesktopRuntime, initializeDesktopRuntime } from "./runtime";
import { installSecurityPolicies } from "./security/window-security";
import { createMainWindow } from "./windows/main-window";

let mainWindow: BrowserWindow | null = null;
let registeredIpc: RegisteredDesktopIpc | null = null;
let shutdownPromise: Promise<void> | null = null;
let shutdownComplete = false;

function openMainWindow(): void {
  mainWindow = createMainWindow();
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function focusMainWindow(): void {
  if (!mainWindow) {
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
}

if (!app.requestSingleInstanceLock()) {
  // Another instance already owns the lock; hand focus to it and exit.
  app.quit();
} else {
  // Privileged-scheme registration must happen before the app is ready.
  registerAttachmentScheme();

  app.on("second-instance", focusMainWindow);

  app.on("before-quit", (event) => {
    if (shutdownComplete) {
      return;
    }

    event.preventDefault();
    shutdownPromise ??= shutdown()
      .catch(() => {
        console.error("Failed to cleanly shut down the desktop application.");
      })
      .finally(() => {
        shutdownComplete = true;
        app.quit();
      });
  });

  void app
    .whenReady()
    .then(async () => {
      // macOS ignores the BrowserWindow icon; set the dock icon explicitly so
      // it shows in development too (packaged builds use the bundle icon).
      if (process.platform === "darwin") {
        app.dock?.setIcon(nativeImage.createFromPath(appIcon));
      }
      installSecurityPolicies();
      // Route the runtime's fetch through Chromium so OAuth token exchange and
      // model calls honor the same proxy the OAuth browser window uses.
      await configureMainNetwork();
      const runtime = initializeDesktopRuntime();
      installAttachmentProtocol(runtime);
      registeredIpc = registerIpc(() => mainWindow, runtime);
      openMainWindow();

      app.on("activate", () => {
        if (mainWindow === null) {
          openMainWindow();
        }
      });
    })
    .catch(() => {
      console.error("Failed to initialize the desktop application.");
      app.quit();
    });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}

async function shutdown(): Promise<void> {
  registeredIpc?.unregister();
  registeredIpc = null;
  await disposeDesktopRuntime();
}
