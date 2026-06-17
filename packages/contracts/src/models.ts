import { z } from "zod";

export const thinkingLevelSchema = z.enum(["off", "minimal", "low", "medium", "high", "xhigh"]);
export type ThinkingLevel = z.infer<typeof thinkingLevelSchema>;

export const modelInputModalitySchema = z.enum(["text", "image"]);
export type ModelInputModality = z.infer<typeof modelInputModalitySchema>;

export const appModelSchema = z.object({
  providerId: z.string(),
  modelId: z.string(),
  name: z.string(),
  reasoning: z.boolean(),
  input: z.array(modelInputModalitySchema),
  contextWindow: z.number(),
  maxTokens: z.number(),
  availableThinkingLevels: z.array(thinkingLevelSchema),
});
export type AppModel = z.infer<typeof appModelSchema>;
