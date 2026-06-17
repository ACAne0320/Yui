import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { AppModel, ModelService } from "@yui/contracts";

export function toAppModel(model: Model<Api>): AppModel {
  return {
    providerId: model.provider,
    modelId: model.id,
    name: model.name,
    reasoning: model.reasoning,
    input: [...model.input],
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
    // Derived from the model's thinkingLevelMap by Pi's own helper.
    availableThinkingLevels: getSupportedThinkingLevels(model),
  };
}

export class PiModelService implements ModelService {
  constructor(private readonly modelRegistry: ModelRegistry) {}

  async listAvailable(): Promise<AppModel[]> {
    return this.modelRegistry.getAvailable().map(toAppModel);
  }
}
