import { join } from "node:path";
import { printJson, printProfile } from "../output/format.ts";
import { reportError, withRuntime } from "../runtime.ts";

/**
 * Show which profile (home/agent/session dirs) the runtime reads and writes, so
 * a user can tell at a glance that the CLI and a future desktop app point at the
 * same place. Both honor `YUI_HOME`; this surfaces whether it is set.
 */
export async function profileShow(opts: { json?: boolean }): Promise<number> {
  const fromEnv = Boolean(process.env.YUI_HOME);
  try {
    return await withRuntime({}, async (runtime) => {
      const { config } = runtime;
      const view = {
        homeDir: config.homeDir,
        agentDir: config.agentDir,
        sessionDir: config.sessionDir,
        authFile: join(config.agentDir, "auth.json"),
        cwd: config.cwd,
        fromEnv,
      };
      const [providers, defaults] = await Promise.all([
        runtime.auth.listProviders(),
        runtime.settings.getDefaults(),
      ]);
      if (opts.json) printJson({ ...view, defaults, providers });
      else printProfile(view, providers, defaults);
      return 0;
    });
  } catch (error) {
    return reportError(error);
  }
}
