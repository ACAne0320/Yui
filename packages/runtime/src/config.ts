import { homedir } from "node:os";
import { join } from "node:path";
import type { RuntimeConfig } from "@yui/contracts";

/**
 * Resolve a RuntimeConfig from explicit overrides, then `YUI_HOME`, then the
 * default `~/.yui`. Tests must always pass explicit temp paths and never fall
 * through to the developer's real profile. (Developers point `YUI_HOME` at a
 * separate profile such as `~/.yui-dev` to avoid touching `~/.yui`.)
 */
export function resolveRuntimeConfig(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  const homeDir = overrides.homeDir ?? process.env.YUI_HOME ?? join(homedir(), ".yui");
  const agentDir = overrides.agentDir ?? join(homeDir, "agent");
  const sessionDir = overrides.sessionDir ?? join(agentDir, "sessions");
  const cwd = overrides.cwd ?? process.cwd();
  return { homeDir, agentDir, sessionDir, cwd };
}
