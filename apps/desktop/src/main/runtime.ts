import { AppRuntimeError, type AppRuntime } from "@yui/contracts";
import { createRuntime, resolveRuntimeConfig } from "@yui/runtime";

let runtime: AppRuntime | null = null;
let disposePromise: Promise<void> | null = null;

export async function initializeDesktopRuntime(): Promise<AppRuntime> {
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
  // Pi resolves its *global* agent dir from PI_CODING_AGENT_DIR (falling back to
  // ~/.pi/agent). That dir governs the bash tool's PATH bin prefix and managed
  // rg/fd, via getShellEnv() -> getBinDir() -> getAgentDir(), which ignore the
  // per-session agentDir Yui threads everywhere else. Point Pi at our own agent
  // dir so the shell PATH prefix lands under YUI_HOME (~/.yui/agent/bin) instead
  // of leaking ~/.pi/agent/bin. Set unconditionally to keep it in lockstep with
  // the agentDir we pass to createAgentSessionServices.
  process.env.PI_CODING_AGENT_DIR = config.agentDir;
  runtime = await createRuntime({ ...config, cwd: config.homeDir });
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
