// Reads and writes the user's persistent defaults via Pi's SettingsManager.
// Getters return the *effective* (project-over-global merged) values, which is
// what open-session resolution will actually use; setters write the global
// settings.json (agentDir/settings.json) so the choice is profile-wide.

import { type ModelRegistry, SettingsManager } from "@earendil-works/pi-coding-agent";
import {
  type AppDefaults,
  AppRuntimeError,
  type RuntimeConfig,
  type SetDefaultModelInput,
  type SetDefaultThinkingLevelInput,
  type SettingsService,
  type ThinkingLevel,
} from "@yui/contracts";

export class PiSettingsService implements SettingsService {
  private readonly settings: SettingsManager;

  constructor(
    config: RuntimeConfig,
    private readonly modelRegistry: ModelRegistry,
  ) {
    this.settings = SettingsManager.create(config.cwd, config.agentDir);
  }

  async getDefaults(): Promise<AppDefaults> {
    return {
      providerId: this.settings.getDefaultProvider(),
      modelId: this.settings.getDefaultModel(),
      thinkingLevel: this.settings.getDefaultThinkingLevel() as ThinkingLevel | undefined,
    };
  }

  async setDefaultModel(input: SetDefaultModelInput): Promise<void> {
    // Guard against pinning a default that does not exist; auth is not required
    // (the model may be reachable later via an env-var key), only that it is a
    // model the registry knows about.
    if (!this.modelRegistry.find(input.providerId, input.modelId)) {
      throw new AppRuntimeError(
        "unknown_model",
        `Unknown model: ${input.providerId}/${input.modelId}`,
      );
    }
    this.settings.setDefaultModelAndProvider(input.providerId, input.modelId);
    await this.flushOrThrow();
  }

  async setDefaultThinkingLevel(input: SetDefaultThinkingLevelInput): Promise<void> {
    this.settings.setDefaultThinkingLevel(input.thinkingLevel);
    await this.flushOrThrow();
  }

  /**
   * Pi's SettingsManager writes asynchronously and swallows errors (and no-ops
   * when settings.json failed to load). `flush()` is its durability boundary;
   * `drainErrors()` is how failures surface. Await the write, then turn any
   * recorded error into a real failure instead of a false success.
   */
  private async flushOrThrow(): Promise<void> {
    await this.settings.flush();
    const errors = this.settings.drainErrors();
    if (errors.length > 0) {
      throw new AppRuntimeError(
        "internal",
        `Failed to write settings: ${errors.map((e) => e.error.message).join("; ")}`,
        errors,
      );
    }
  }
}
