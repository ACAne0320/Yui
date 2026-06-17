import { join } from "node:path";
import { BrowserWindow } from "electron";
import appIcon from "../../../build/icon.png?asset";

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 720,
    minHeight: 520,
    show: false,
    // Window/taskbar icon on Windows & Linux. macOS ignores this and uses the
    // dock icon set in `main/index.ts` (dev) or the bundle icon (packaged).
    icon: appIcon,
    // Frameless title bar so the renderer's top toolbar extends to the window
    // edge. On macOS the native traffic lights stay (real close/minimize/zoom)
    // and are inset to align with the in-app `.win-actions` row; other
    // platforms fall back to the standard OS frame.
    ...(process.platform === "darwin"
      ? { titleBarStyle: "hidden" as const, trafficLightPosition: { x: 18, y: 18 } }
      : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => window.show());

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return window;
}
