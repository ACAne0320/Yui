// CRUD for the named-subagent definitions the `subagent` tool offers. The
// files in `<agentDir>/agents/` stay the source of truth (hand-editable,
// shareable, pi-compatible); this service is the write path the settings UI
// uses so users never have to touch the files directly. Builtin roles are
// code-defined: "editing" one writes an override file with its name, and
// deleting that file restores the default definition.

import * as fs from "node:fs";
import * as path from "node:path";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";
import {
  AppRuntimeError,
  type DeleteSubagentInput,
  type RuntimeConfig,
  type SaveSubagentInput,
  type SubagentCatalog,
  type SubagentConfig,
  type SubagentConfigService,
} from "@yui/contracts";
import { stringify as stringifyYaml } from "yaml";
import { discoverAgents, type SubagentAgentConfig } from "./subagent-agents.ts";
import { BUILTIN_AGENTS, CORE_TOOL_NAMES } from "./subagent-builtins.ts";

export class FileSubagentConfigService implements SubagentConfigService {
  constructor(private readonly config: RuntimeConfig) {}

  private get agentsDir(): string {
    return path.join(this.config.agentDir, "agents");
  }

  /** Builtins first (overridden by their user file when one exists), then extras. */
  async list(): Promise<SubagentCatalog> {
    const userAgents = discoverAgents(this.config.agentDir);
    const userByName = new Map(userAgents.map((agent) => [agent.name, agent]));
    const builtins = BUILTIN_AGENTS.map((builtin) => {
      const override = userByName.get(builtin.name);
      return toDto(override ?? builtin, { builtin: true, hasFile: override !== undefined });
    });
    const extras = userAgents
      .filter((agent) => !BUILTIN_AGENTS.some((builtin) => builtin.name === agent.name))
      .map((agent) => toDto(agent, { builtin: false, hasFile: true }));
    return { agents: [...builtins, ...extras], availableTools: [...CORE_TOOL_NAMES] };
  }

  async save(input: SaveSubagentInput): Promise<void> {
    const userAgents = discoverAgents(this.config.agentDir);
    const sourceName = input.previousName ?? input.name;
    const existing = userAgents.find((agent) => agent.name === sourceName);
    if (input.previousName && input.previousName !== input.name) {
      if (!existing) {
        // Builtins cannot be renamed (the override would not shadow anything).
        throw new AppRuntimeError(
          "invalid_input",
          `Cannot rename "${input.previousName}": it has no agent file.`,
        );
      }
      if (userAgents.some((agent) => agent.name === input.name)) {
        throw new AppRuntimeError("invalid_input", `Agent "${input.name}" already exists.`);
      }
    }

    // Round-trip frontmatter keys this UI does not know about, so a save never
    // destroys fields the user added by hand.
    const frontmatter: Record<string, unknown> = existing?.filePath
      ? {
          ...parseFrontmatter<Record<string, unknown>>(readFileOrThrow(existing.filePath))
            .frontmatter,
        }
      : {};
    frontmatter.name = input.name;
    frontmatter.description = input.description;
    if (input.tools && input.tools.length > 0) {
      frontmatter.tools = input.tools.join(", ");
    } else {
      delete frontmatter.tools;
    }
    if (input.model) {
      frontmatter.model = input.model;
    } else {
      delete frontmatter.model;
    }

    // Renames update the existing file in place (its name on disk is the
    // user's choice; discovery keys on frontmatter, not the filename).
    const filePath = existing?.filePath ?? path.join(this.agentsDir, `${input.name}.md`);
    const body = input.systemPrompt.trim();
    const content = `---\n${stringifyYaml(frontmatter)}---\n${body ? `\n${body}\n` : ""}`;
    try {
      fs.mkdirSync(this.agentsDir, { recursive: true });
      fs.writeFileSync(filePath, content, "utf-8");
    } catch (error) {
      throw new AppRuntimeError(
        "internal",
        `Failed to write agent file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async delete(input: DeleteSubagentInput): Promise<void> {
    const userAgents = discoverAgents(this.config.agentDir);
    const existing = userAgents.find((agent) => agent.name === input.name);
    if (!existing?.filePath) {
      const builtin = BUILTIN_AGENTS.some((agent) => agent.name === input.name);
      throw new AppRuntimeError(
        "invalid_input",
        builtin
          ? `"${input.name}" is a builtin agent without an override file; nothing to delete.`
          : `Unknown agent: ${input.name}.`,
      );
    }
    try {
      fs.rmSync(existing.filePath);
    } catch (error) {
      throw new AppRuntimeError(
        "internal",
        `Failed to delete agent file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

function toDto(
  agent: SubagentAgentConfig,
  flags: { builtin: boolean; hasFile: boolean },
): SubagentConfig {
  return {
    name: agent.name,
    description: agent.description,
    systemPrompt: agent.systemPrompt,
    tools: agent.tools,
    model: agent.model,
    ...flags,
  };
}

function readFileOrThrow(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch (error) {
    throw new AppRuntimeError(
      "internal",
      `Failed to read agent file: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
