import type { AppRuntime, RuntimeConfig } from "@yui/contracts";
import { PiAgentService } from "./agent/agent-service.ts";
import { FileSubagentConfigService } from "./agent/subagent-config-service.ts";
import { FileExtensionCatalogService } from "./extensions/extension-catalog-service.ts";
import { PiAuthService } from "./auth/auth-service.ts";
import { PiModelService } from "./models/model-service.ts";
import { PersonaStore } from "./persona/persona-store.ts";
import { createInfrastructure } from "./pi/infrastructure.ts";
import { PiSessionCatalog } from "./sessions/session-catalog.ts";
import { PiSettingsService } from "./settings/settings-service.ts";

/**
 * Compose the shared Pi infrastructure and Yui services into an AppRuntime.
 * One runtime owns one set of Pi instances and a pool of active sessions.
 */
export async function createRuntime(config: RuntimeConfig): Promise<AppRuntime> {
  const infra = await createInfrastructure(config);
  const auth = new PiAuthService(infra.modelRuntime, infra.modelRegistry, infra.authPath);
  const models = new PiModelService(infra.modelRegistry);
  const settings = new PiSettingsService(config, infra.modelRegistry);
  const persona = PersonaStore.forConfig(config);
  const agents = new PiAgentService(infra, config, persona);
  const subagents = new FileSubagentConfigService(config);
  const extensions = new FileExtensionCatalogService(config);
  const sessions = new PiSessionCatalog(config);

  return {
    config,
    auth,
    models,
    settings,
    persona,
    agents,
    subagents,
    extensions,
    sessions,
    async dispose() {
      await agents.dispose();
      auth.dispose();
    },
  };
}
