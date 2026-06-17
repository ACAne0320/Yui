import { z } from "zod";
import { thinkingLevelSchema, type ThinkingLevel } from "./models.ts";

/**
 * Persistent, user-chosen defaults. These back the resolution Pi performs when
 * a session is opened without an explicit model/thinking level, so a user can
 * pick a model once instead of passing flags every time. Any field may be unset.
 */
export interface AppDefaults {
  providerId?: string;
  modelId?: string;
  thinkingLevel?: ThinkingLevel;
}

export const setDefaultModelInputSchema = z.object({
  providerId: z.string().min(1),
  modelId: z.string().min(1),
});
export type SetDefaultModelInput = z.infer<typeof setDefaultModelInputSchema>;

export const setDefaultThinkingLevelInputSchema = z.object({
  thinkingLevel: thinkingLevelSchema,
});
export type SetDefaultThinkingLevelInput = z.infer<typeof setDefaultThinkingLevelInputSchema>;
