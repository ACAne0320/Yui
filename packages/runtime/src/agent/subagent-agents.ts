// Named-agent discovery for the built-in subagent tool. Agents are markdown
// files in `<agentDir>/agents/` with `name`/`description` (+ optional `tools`,
// `model`) frontmatter and the system prompt as body — the same format pi's
// subagent example uses. Three builtin roles (see subagent-builtins.ts) are
// always available; a user file with the same name overrides the builtin.

import * as fs from "node:fs";
import * as path from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import { type ModelRegistry, parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { BUILTIN_AGENTS } from "./subagent-builtins.ts";

/** A named agent definition: a builtin role or `<agentDir>/agents/<file>.md`. */
export interface SubagentAgentConfig {
  name: string;
  description: string;
  tools?: string[];
  model?: string;
  systemPrompt: string;
  /** Backing file. Absent for builtin roles (code-defined). */
  filePath?: string;
}

/**
 * Load named agents from `<agentDir>/agents/*.md`. Files missing the required
 * `name`/`description` frontmatter are skipped; fs errors yield an empty list
 * (the tool then only offers the default, promptless subagent).
 */
export function discoverAgents(agentDir: string): SubagentAgentConfig[] {
  const dir = path.join(agentDir, "agents");
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const agents: SubagentAgentConfig[] = [];
  for (const entry of entries) {
    if (!entry.name.endsWith(".md") || (!entry.isFile() && !entry.isSymbolicLink())) continue;
    const filePath = path.join(dir, entry.name);
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }
    const { frontmatter, body } = parseFrontmatter<Record<string, string>>(content);
    if (!frontmatter.name || !frontmatter.description) continue;
    const tools = frontmatter.tools
      ?.split(",")
      .map((tool) => tool.trim())
      .filter(Boolean);
    agents.push({
      name: frontmatter.name,
      description: frontmatter.description,
      tools: tools && tools.length > 0 ? tools : undefined,
      model: frontmatter.model,
      systemPrompt: body,
      filePath,
    });
  }
  return agents;
}

/**
 * The full agent list the subagent tool offers: builtin roles plus discovered
 * user files, where a user file with a builtin's name replaces the builtin
 * (delete the file to restore the default definition).
 */
export function loadAgents(agentDir: string): SubagentAgentConfig[] {
  const userAgents = discoverAgents(agentDir);
  const builtins = BUILTIN_AGENTS.filter(
    (builtin) => !userAgents.some((agent) => agent.name === builtin.name),
  );
  return [...builtins, ...userAgents];
}

/** Resolve an agent's `model` frontmatter: `provider/model-id` or a bare model id. */
export function resolveAgentModel(registry: ModelRegistry, spec: string): Model<Api> | undefined {
  const slash = spec.indexOf("/");
  if (slash > 0) {
    const model = registry.find(spec.slice(0, slash), spec.slice(slash + 1));
    if (model) return model;
  }
  return registry.getAll().find((model) => model.id === spec);
}
