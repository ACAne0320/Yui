import { app, session, shell } from "electron";

/**
 * Installs process-wide security policies. Must be called after the app is
 * ready and before any window is created, so the `web-contents-created`
 * listener catches every renderer (including the main window and any future
 * window or webview).
 */
export function installSecurityPolicies(): void {
  app.on("web-contents-created", (_event, contents) => {
    // Never open in-app windows. http(s) targets (e.g. links in rendered
    // markdown, which set target=_blank) go to the system browser instead.
    contents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith("https://") || url.startsWith("http://")) {
        void shell.openExternal(url);
      }
      return { action: "deny" };
    });
    contents.on("will-navigate", (event) => event.preventDefault());
  });

  // Deny every permission request (camera, microphone, geolocation,
  // notifications, ...) except the explicit allowlist below. Sanitized
  // clipboard WRITE backs the copy buttons (messages, code blocks); clipboard
  // READ stays denied.
  const allowedPermissions = new Set(["clipboard-sanitized-write"]);
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(allowedPermissions.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) =>
    allowedPermissions.has(permission),
  );
}
