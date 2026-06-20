import type { PersonaConfig, PersonaScope } from "@yui/contracts";

export type PersonaScopeKind = "session" | "memoryless" | "subagent";

export interface ResolvePersonaScopeInput {
  config: PersonaConfig;
  kind?: PersonaScopeKind;
  /**
   * Session-level memory override. `false` disables memory for that session;
   * `true` does not override a globally disabled persona config.
   */
  memory?: boolean;
}

export function resolvePersonaScope(input: ResolvePersonaScopeInput): PersonaScope {
  if (input.kind === "subagent") {
    return { soul: false, globalMemory: false, cwdMemory: true };
  }

  const memoryEnabled =
    input.kind === "memoryless" ? false : input.config.memoryEnabled && input.memory !== false;
  return { soul: true, globalMemory: memoryEnabled, cwdMemory: memoryEnabled };
}
