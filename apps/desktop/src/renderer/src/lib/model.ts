import type { AppModel } from "@yui/contracts";

export function modelKey(model: Pick<AppModel, "providerId" | "modelId">): string {
  return `${model.providerId}/${model.modelId}`;
}
