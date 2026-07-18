// Creates the shared, cwd-independent Pi instances the runtime owns, scoped to
// explicit profile paths. ModelRuntime is the profile-global canonical
// model/auth facade (one per profile); the synchronous ModelRegistry facade is
// derived from it for extension-facing and call-site reads. cwd-bound services
// (SettingsManager, ResourceLoader) are NOT created here — they are built per
// session against that session's own cwd, so a reopened session reads the
// correct project's settings.json / AGENTS.md.

import { join } from "node:path";
import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { RuntimeConfig } from "@yui/contracts";

export interface PiInfrastructure {
  modelRuntime: ModelRuntime;
  modelRegistry: ModelRegistry;
  /** Path of the auth.json backing the runtime's credential store. */
  authPath: string;
}

export interface CreateInfrastructureOptions {
  /**
   * Forwarded to ModelRuntime.create(). Defaults to Pi's own behavior
   * (network allowed unless PI_OFFLINE is set); tests pass false to stay
   * offline and deterministic.
   */
  allowModelNetwork?: boolean;
}

export async function createInfrastructure(
  config: RuntimeConfig,
  options: CreateInfrastructureOptions = {},
): Promise<PiInfrastructure> {
  const authPath = join(config.agentDir, "auth.json");
  const modelRuntime = await ModelRuntime.create({
    authPath,
    modelsPath: join(config.agentDir, "models.json"),
    allowModelNetwork: options.allowModelNetwork,
  });
  const modelRegistry = new ModelRegistry(modelRuntime);
  return { modelRuntime, modelRegistry, authPath };
}
