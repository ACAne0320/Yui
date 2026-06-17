import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeConfig } from "@yui/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileSubagentConfigService } from "./subagent-config-service.ts";

describe("FileSubagentConfigService", () => {
  let dir: string;
  let service: FileSubagentConfigService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "yui-subagent-config-"));
    const config: RuntimeConfig = {
      homeDir: dir,
      agentDir: dir,
      sessionDir: join(dir, "sessions"),
      cwd: dir,
    };
    service = new FileSubagentConfigService(config);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const agentFile = (name: string) => join(dir, "agents", `${name}.md`);
  const listAgents = async () => (await service.list()).agents;

  it("lists the builtin roles and the available tool names when no files exist", async () => {
    const catalog = await service.list();
    expect(catalog.agents.map((agent) => agent.name)).toEqual([
      "planner",
      "developer",
      "researcher",
    ]);
    expect(catalog.agents.every((agent) => agent.builtin && !agent.hasFile)).toBe(true);
    expect(catalog.availableTools).toContain("read");
    expect(catalog.availableTools).toContain("bash");
  });

  it("creates an agent file that discovery can read back", async () => {
    await service.save({
      name: "scout",
      description: "Fast explorer",
      systemPrompt: "You are a scout.",
      tools: ["read", "bash"],
      model: "anthropic/claude-test",
    });

    const scout = (await listAgents()).find((agent) => agent.name === "scout");
    expect(scout).toMatchObject({
      description: "Fast explorer",
      systemPrompt: "You are a scout.",
      tools: ["read", "bash"],
      model: "anthropic/claude-test",
      builtin: false,
      hasFile: true,
    });
  });

  it("overrides a builtin and resets it on delete", async () => {
    await service.save({
      name: "planner",
      description: "my planner",
      systemPrompt: "custom planning prompt",
    });

    let planner = (await listAgents()).find((agent) => agent.name === "planner");
    expect(planner).toMatchObject({ builtin: true, hasFile: true, description: "my planner" });
    expect(planner?.tools).toBeUndefined();

    await service.delete({ name: "planner" });
    planner = (await listAgents()).find((agent) => agent.name === "planner");
    expect(planner?.hasFile).toBe(false);
    expect(planner?.description).toContain("planning agent");
  });

  it("round-trips frontmatter keys the UI does not know about", async () => {
    mkdirSync(join(dir, "agents"));
    writeFileSync(
      agentFile("scout"),
      "---\nname: scout\ndescription: old\ncolor: teal\n---\nold prompt",
    );

    await service.save({ name: "scout", description: "new", systemPrompt: "new prompt" });

    const content = readFileSync(agentFile("scout"), "utf-8");
    expect(content).toContain("color: teal");
    expect(content).toContain("description: new");
    expect(content).toContain("new prompt");
    expect(content).not.toContain("old prompt");
  });

  it("renames in place via previousName and rejects collisions", async () => {
    await service.save({ name: "scout", description: "explorer", systemPrompt: "p" });
    await service.save({ name: "review", description: "reviewer", systemPrompt: "p" });

    await service.save({
      name: "ranger",
      previousName: "scout",
      description: "explorer",
      systemPrompt: "p",
    });
    const names = (await listAgents()).map((agent) => agent.name);
    expect(names).toContain("ranger");
    expect(names).not.toContain("scout");
    // The original file is updated in place, not duplicated under a new name.
    expect(readFileSync(agentFile("scout"), "utf-8")).toContain("name: ranger");

    await expect(
      service.save({
        name: "review",
        previousName: "ranger",
        description: "x",
        systemPrompt: "p",
      }),
    ).rejects.toThrow(/already exists/);
    await expect(
      service.save({ name: "other", previousName: "ghost", description: "x", systemPrompt: "p" }),
    ).rejects.toThrow(/no agent file/);
  });

  it("rejects deleting builtins without an override and unknown agents", async () => {
    await expect(service.delete({ name: "planner" })).rejects.toThrow(/builtin/);
    await expect(service.delete({ name: "ghost" })).rejects.toThrow(/Unknown agent/);
  });

  it("writes yaml-safe frontmatter for values with special characters", async () => {
    await service.save({
      name: "tricky",
      description: 'colon: and "quotes" — #hash',
      systemPrompt: "prompt",
    });
    const tricky = (await listAgents()).find((agent) => agent.name === "tricky");
    expect(tricky?.description).toBe('colon: and "quotes" — #hash');
  });
});
