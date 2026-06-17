import { AppRuntimeError, type AppRuntime } from "@yui/contracts";
import { createRuntime, resolveRuntimeConfig } from "@yui/runtime";

let runtime: AppRuntime | null = null;
let disposePromise: Promise<void> | null = null;

export function initializeDesktopRuntime(): AppRuntime {
  if (runtime) {
    return runtime;
  }
  if (disposePromise) {
    throw new AppRuntimeError("internal", "Desktop runtime is shutting down.");
  }

  // The desktop app has no meaningful process cwd (a Finder launch runs at
  // "/"), and its settings UI edits profile-wide defaults. Bind the runtime —
  // and thus the settings service's project-settings lookup — to the profile
  // home, where no `.pi/settings.json` ever exists, so getDefaults reports
  // exactly the global file the UI writes, independent of launch location.
  // Sessions are unaffected: each one builds its services against its own cwd.
  const config = resolveRuntimeConfig();
  runtime = createRuntime({ ...config, cwd: config.homeDir });
  return runtime;
}

export function getDesktopRuntime(): AppRuntime {
  if (!runtime) {
    throw new AppRuntimeError("internal", "Desktop runtime is not initialized.");
  }
  return runtime;
}

export function disposeDesktopRuntime(): Promise<void> {
  if (disposePromise) {
    return disposePromise;
  }

  const current = runtime;
  runtime = null;
  disposePromise = current ? current.dispose() : Promise.resolve();
  return disposePromise;
}
