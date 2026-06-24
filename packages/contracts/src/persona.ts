// Yui-owned persona contracts. These DTOs are Pi-independent and serializable;
// no Pi package import may appear in this package.

import { z } from "zod";

export const memoryScopeSchema = z.enum(["global", "cwd"]);
export type MemoryScope = z.infer<typeof memoryScopeSchema>;

export const personaScopeSchema = z.object({
  soul: z.boolean(),
  globalMemory: z.boolean(),
  cwdMemory: z.boolean(),
});
export type PersonaScope = z.infer<typeof personaScopeSchema>;

export const personaConfigSchema = z.object({
  memoryEnabled: z.boolean(),
});
export type PersonaConfig = z.infer<typeof personaConfigSchema>;

export const setPersonaConfigInputSchema = personaConfigSchema;
export type SetPersonaConfigInput = z.infer<typeof setPersonaConfigInputSchema>;

export const soulDocSchema = z.object({
  content: z.string(),
  path: z.string(),
  updatedAt: z.string().optional(),
});
export type SoulDoc = z.infer<typeof soulDocSchema>;

export const saveSoulInputSchema = z.object({
  content: z.string(),
});
export type SaveSoulInput = z.infer<typeof saveSoulInputSchema>;

export const memoryEntrySchema = z.object({
  slug: z.string().min(1),
  scope: memoryScopeSchema,
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  createdAt: z.string(),
  content: z.string(),
  path: z.string(),
  cwd: z.string().optional(),
});
export type MemoryEntry = z.infer<typeof memoryEntrySchema>;

/** A working directory that has at least one project ("cwd"-scoped) memory,
    surfaced so the settings panel can switch between projects. */
export const memoryProjectSchema = z.object({
  cwd: z.string(),
  count: z.number().int().nonnegative(),
});
export type MemoryProject = z.infer<typeof memoryProjectSchema>;

export const rememberInputSchema = z.object({
  text: z.string().min(1),
  scope: memoryScopeSchema,
  tags: z.array(z.string().min(1)).optional(),
});
export type RememberInput = z.infer<typeof rememberInputSchema>;

export const recallInputSchema = z.object({
  query: z.string().min(1),
  scope: memoryScopeSchema.optional(),
});
export type RecallInput = z.infer<typeof recallInputSchema>;

export const listMemoryInputSchema = z.object({
  scope: memoryScopeSchema,
  /** Required for `cwd` scope: the project whose memory to read. */
  cwd: z.string().optional(),
});
export type ListMemoryInput = z.infer<typeof listMemoryInputSchema>;

export const saveMemoryInputSchema = z.object({
  scope: memoryScopeSchema,
  cwd: z.string().optional(),
  /** Omit to create; pass an existing slug to overwrite that entry. */
  slug: z.string().optional(),
  name: z.string().min(1),
  description: z.string(),
  tags: z.array(z.string()).optional(),
  content: z.string(),
});
export type SaveMemoryInput = z.infer<typeof saveMemoryInputSchema>;

export const deleteMemoryInputSchema = z.object({
  scope: memoryScopeSchema,
  cwd: z.string().optional(),
  slug: z.string().min(1),
});
export type DeleteMemoryInput = z.infer<typeof deleteMemoryInputSchema>;

export const openSessionPersonaInputSchema = z.object({
  /**
   * `false` opens a session without memory layers. SOUL remains controlled by
   * PersonaScope and is not disabled by this knob.
   */
  memory: z.boolean().optional(),
});
export type OpenSessionPersonaInput = z.infer<typeof openSessionPersonaInputSchema>;
