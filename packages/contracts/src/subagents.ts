import { z } from "zod";

/**
 * A named subagent the `subagent` tool can run. The list merges the three
 * system-defined roles (planner/developer/researcher) with user-managed
 * markdown files in `<agentDir>/agents/`; a file named after a builtin
 * overrides its definition, and deleting that file restores the default.
 */
export interface SubagentConfig {
  name: string;
  description: string;
  /** Appended to the child session's system prompt. Empty = promptless. */
  systemPrompt: string;
  /** Tool-name allowlist for the child session. Unset = all tools. */
  tools?: string[];
  /** `provider/model-id` or bare model id. Unset = the parent's model. */
  model?: string;
  /** One of the system-defined roles (cannot be removed, only overridden). */
  builtin: boolean;
  /** A user file backs this agent; for builtins this means "customized". */
  hasFile: boolean;
}

/** What the subagents settings surface works with in one fetch. */
export interface SubagentCatalog {
  agents: SubagentConfig[];
  /**
   * Names valid in an agent's `tools` allowlist (pi's core toolset). Sourced
   * from the runtime so the UI never hardcodes pi knowledge.
   */
  availableTools: string[];
}

/** File-name-safe agent names: letters/digits plus `-`/`_`, max 64 chars. */
export const subagentNameSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/, "Invalid agent name");

export const saveSubagentInputSchema = z.object({
  name: subagentNameSchema,
  /** Required: agents without a description are skipped by discovery. */
  description: z.string().trim().min(1).max(500),
  systemPrompt: z.string(),
  tools: z.array(z.string().trim().min(1)).optional(),
  model: z.string().trim().min(1).optional(),
  /** Set when renaming an existing user agent; its file is replaced. */
  previousName: subagentNameSchema.optional(),
});
export type SaveSubagentInput = z.infer<typeof saveSubagentInputSchema>;

export const deleteSubagentInputSchema = z.object({
  name: subagentNameSchema,
});
export type DeleteSubagentInput = z.infer<typeof deleteSubagentInputSchema>;
