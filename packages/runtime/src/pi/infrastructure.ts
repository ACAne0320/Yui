// Creates the shared, cwd-independent Pi instances the runtime owns, scoped to
// explicit profile paths. AuthStorage and ModelRegistry are global (one per
// profile); cwd-bound services (SettingsManager, ResourceLoader) are NOT created
// here — they are built per session against that session's own cwd, so a
// reopened session reads the correct project's settings.json / AGENTS.md.

import { join } from "node:path";
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { RuntimeConfig } from "@yui/contracts";

export interface PiInfrastructure {
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
}

export function createInfrastructure(config: RuntimeConfig): PiInfrastructure {
  const authStorage = AuthStorage.create(join(config.agentDir, "auth.json"));
  const modelRegistry = ModelRegistry.create(authStorage, join(config.agentDir, "models.json"));
  return { authStorage, modelRegistry };
}
