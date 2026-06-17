import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  AgentSession,
  AgentSessionEvent,
  AuthStorage,
  ExtensionUIContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import { discoverAgents, loadAgents, resolveAgentModel } from "./subagent-agents.ts";
import { BUILTIN_AGENTS } from "./subagent-builtins.ts";
import { createSubagentTool, resolveChainTask, type SubagentDetails } from "./subagent-tool.ts";
import { SubagentTranscript, summarizeArgs } from "./subagent-transcript.ts";

const event = (value: unknown) => value as AgentSessionEvent;

const textDelta = (delta: string) =>
  event({
    type: "message_update",
    assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta },
    message: { role: "assistant", content: [] },
  });

const messageEnd = (text: string) =>
  event({
    type: "message_end",
    message: { role: "assistant", content: text ? [{ type: "text", text }] : [] },
  });

const toolStart = (toolName: string, args: unknown, toolCallId = "t1") =>
  event({ type: "tool_execution_start", toolCallId, toolName, args });

const toolEnd = (toolCallId: string, text: string, isError = false) =>
  event({
    type: "tool_execution_end",
    toolCallId,
    toolName: "any",
    result: { content: text ? [{ type: "text", text }] : [] },
    isError,
  });

describe("SubagentTranscript", () => {
  it("accumulates streaming text and promotes it on message_end", () => {
    const transcript = new SubagentTranscript();
    expect(transcript.apply(textDelta("Looking at "))).toBe(true);
    expect(transcript.apply(textDelta("the repo."))).toBe(true);
    expect(transcript.renderProgress()).toBe("Looking at the repo.");

    expect(transcript.apply(messageEnd("Looking at the repo."))).toBe(true);
    expect(transcript.finalText).toBe("Looking at the repo.");
    expect(transcript.renderProgress()).toBe("Looking at the repo.");
  });

  it("interleaves tool lines and keeps the last assistant text as the report", () => {
    const transcript = new SubagentTranscript();
    transcript.apply(messageEnd("Checking files."));
    transcript.apply(toolStart("bash", { command: "ls" }));
    transcript.apply(toolStart("read", { path: "a.ts" }));
    transcript.apply(messageEnd("Done: 2 files found."));

    expect(transcript.toolUseCount).toBe(2);
    expect(transcript.finalText).toBe("Done: 2 files found.");
    expect(transcript.renderProgress()).toBe(
      [
        "Checking files.",
        '→ bash {"command":"ls"}',
        '→ read {"path":"a.ts"}',
        "Done: 2 files found.",
      ].join("\n"),
    );
  });

  it("ignores events that carry nothing renderable", () => {
    const transcript = new SubagentTranscript();
    expect(transcript.apply(event({ type: "agent_start" }))).toBe(false);
    expect(transcript.apply(messageEnd(""))).toBe(false);
    expect(
      transcript.apply(
        event({
          type: "message_update",
          assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "hm" },
          message: { role: "assistant", content: [] },
        }),
      ),
    ).toBe(false);
    expect(transcript.renderProgress()).toBe("");
  });

  it("clears streaming text once the message completes without text", () => {
    const transcript = new SubagentTranscript();
    transcript.apply(textDelta("partial"));
    transcript.apply(messageEnd(""));
    expect(transcript.renderProgress()).toBe("");
  });

  it("attaches tool outputs to their step and flags errors", () => {
    const transcript = new SubagentTranscript();
    transcript.apply(toolStart("bash", { command: "ls" }, "call-1"));
    transcript.apply(toolStart("read", { path: "a.ts" }, "call-2"));
    expect(transcript.apply(toolEnd("call-1", "file1\nfile2"))).toBe(true);
    expect(transcript.apply(toolEnd("call-2", "boom", true))).toBe(true);
    expect(transcript.apply(toolEnd("call-x", "ignored"))).toBe(false);

    const steps = transcript.steps(true);
    expect(steps[0]).toMatchObject({ kind: "tool", result: "file1\nfile2" });
    expect(steps[0].isError).toBeUndefined();
    expect(steps[1]).toMatchObject({ kind: "tool", result: "boom", isError: true });
  });

  it("caps tool results in the running snapshot but not the final one", () => {
    const transcript = new SubagentTranscript();
    transcript.apply(toolStart("bash", { command: "ls" }, "call-1"));
    transcript.apply(toolEnd("call-1", "z".repeat(1_000)));

    expect(transcript.steps()[0].result?.length).toBe(701); // 700 chars + "…"
    expect(transcript.steps(true)[0].result?.length).toBe(1_000);
  });

  it("exposes structured steps with the streaming tail as a text step", () => {
    const transcript = new SubagentTranscript();
    transcript.apply(messageEnd("Plan ready."));
    transcript.apply(toolStart("bash", { command: "ls" }));
    transcript.apply(textDelta("Looking"));

    expect(transcript.steps()).toEqual([
      { kind: "text", text: "Plan ready." },
      { kind: "tool", text: 'bash {"command":"ls"}' },
      { kind: "text", text: "Looking" },
    ]);
  });

  it("tail-caps the running snapshot but ships the final one complete", () => {
    const transcript = new SubagentTranscript();
    for (let i = 0; i < 40; i += 1) transcript.apply(toolStart("bash", { command: `c${i}` }));
    transcript.apply(messageEnd("y".repeat(5_000)));

    const running = transcript.steps();
    expect(running).toHaveLength(30);
    const last = running.at(-1);
    expect(last?.kind).toBe("text");
    expect(last?.text.length).toBe(4_001); // "…" + last 4000 chars

    const final = transcript.steps(true);
    expect(final).toHaveLength(41);
    expect(final.at(-1)?.text.length).toBe(5_000);
  });

  it("caps progress output at the tail", () => {
    const transcript = new SubagentTranscript();
    transcript.apply(messageEnd("x".repeat(3_000)));
    const progress = transcript.renderProgress();
    expect(progress.length).toBe(2_001); // "…" + last 2000 chars
    expect(progress.startsWith("…")).toBe(true);
    // The final report is not capped by the progress limit.
    expect(transcript.finalText.length).toBe(3_000);
  });
});

describe("discoverAgents", () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("loads .md agents with frontmatter and skips incomplete ones", () => {
    dir = mkdtempSync(join(tmpdir(), "yui-agents-"));
    mkdirSync(join(dir, "agents"));
    writeFileSync(
      join(dir, "agents", "scout.md"),
      [
        "---",
        "name: scout",
        "description: Fast read-only explorer",
        "tools: read, bash",
        "model: anthropic/claude-test",
        "---",
        "You are a scout. Investigate and report.",
      ].join("\n"),
    );
    writeFileSync(join(dir, "agents", "broken.md"), "---\nname: broken\n---\nno description");
    writeFileSync(join(dir, "agents", "notes.txt"), "not an agent");

    const agents = discoverAgents(dir);
    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({
      name: "scout",
      description: "Fast read-only explorer",
      tools: ["read", "bash"],
      model: "anthropic/claude-test",
    });
    expect(agents[0].systemPrompt).toContain("You are a scout.");
  });

  it("returns an empty list when the agents directory is missing", () => {
    dir = mkdtempSync(join(tmpdir(), "yui-agents-"));
    expect(discoverAgents(dir)).toEqual([]);
  });
});

describe("loadAgents", () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("offers the builtin roles even with no agents directory", () => {
    dir = mkdtempSync(join(tmpdir(), "yui-agents-"));
    const names = loadAgents(dir).map((agent) => agent.name);
    expect(names).toEqual(["planner", "developer", "researcher"]);
  });

  it("lets a user file override a builtin and appends extra agents", () => {
    dir = mkdtempSync(join(tmpdir(), "yui-agents-"));
    mkdirSync(join(dir, "agents"));
    writeFileSync(
      join(dir, "agents", "planner.md"),
      "---\nname: planner\ndescription: my planner\n---\ncustom prompt",
    );
    writeFileSync(join(dir, "agents", "scout.md"), "---\nname: scout\ndescription: extra\n---\n");

    const agents = loadAgents(dir);
    const planner = agents.find((agent) => agent.name === "planner");
    expect(planner?.description).toBe("my planner");
    expect(planner?.filePath).toBeDefined();
    expect(agents.map((agent) => agent.name).sort()).toEqual([
      "developer",
      "planner",
      "researcher",
      "scout",
    ]);
    // The untouched builtins keep their code-defined form.
    expect(agents.find((agent) => agent.name === "developer")).toBe(
      BUILTIN_AGENTS.find((agent) => agent.name === "developer"),
    );
  });
});

describe("resolveAgentModel", () => {
  const registry = {
    find: (provider: string, id: string) =>
      provider === "anthropic" && id === "claude-test" ? { provider, id } : undefined,
    getAll: () => [
      { provider: "anthropic", id: "claude-test" },
      { provider: "openai", id: "gpt-test" },
    ],
  } as unknown as ModelRegistry;

  it("resolves provider/model-id specs", () => {
    expect(resolveAgentModel(registry, "anthropic/claude-test")).toMatchObject({
      id: "claude-test",
    });
  });

  it("falls back to a bare model id across providers", () => {
    expect(resolveAgentModel(registry, "gpt-test")).toMatchObject({ provider: "openai" });
  });

  it("returns undefined for unknown specs", () => {
    expect(resolveAgentModel(registry, "nope/missing")).toBeUndefined();
    expect(resolveAgentModel(registry, "missing")).toBeUndefined();
  });
});

describe("resolveChainTask", () => {
  it("substitutes every {previous} occurrence", () => {
    expect(resolveChainTask("Review: {previous} — focus on {previous}", "the plan")).toBe(
      "Review: the plan — focus on the plan",
    );
  });

  it("leaves tasks without the placeholder untouched", () => {
    expect(resolveChainTask("plain task", "report")).toBe("plain task");
  });

  it("keeps $-patterns in the previous report literal", () => {
    expect(resolveChainTask("Use: {previous}", "regex `$&` and bash $'x'")).toBe(
      "Use: regex `$&` and bash $'x'",
    );
  });
});

describe("subagent tool parameter validation", () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  // A host that looks bound; validation paths return before touching sessions.
  const makeTool = () => {
    dir = mkdtempSync(join(tmpdir(), "yui-agents-"));
    return createSubagentTool({
      agentDir: dir,
      authStorage: {} as AuthStorage,
      modelRegistry: {} as ModelRegistry,
      host: {
        session: {} as AgentSession,
        bridge: {} as ExtensionUIContext,
        cwd: dir,
      },
    });
  };
  const textOf = (result: { content: Array<{ type: string; text?: string }> }) =>
    result.content[0]?.text ?? "";

  it("throws when the host is not bound yet", async () => {
    dir = mkdtempSync(join(tmpdir(), "yui-agents-"));
    const tool = createSubagentTool({
      agentDir: dir,
      authStorage: {} as AuthStorage,
      modelRegistry: {} as ModelRegistry,
      host: {},
    });
    await expect(tool.execute("t1", { task: "x" }, undefined, undefined, ctx())).rejects.toThrow(
      /not bound/,
    );
  });

  it("rejects zero or two modes", async () => {
    const tool = makeTool();
    const none = await tool.execute("t1", {}, undefined, undefined, ctx());
    expect((none.details as SubagentDetails).status).toBe("invalid");
    const both = await tool.execute(
      "t1",
      { task: "a", tasks: [{ task: "b" }] },
      undefined,
      undefined,
      ctx(),
    );
    expect((both.details as SubagentDetails).status).toBe("invalid");
    expect(textOf(both)).toContain("exactly one mode");
    const chainAndTasks = await tool.execute(
      "t1",
      { tasks: [{ task: "a" }], chain: [{ task: "b" }] },
      undefined,
      undefined,
      ctx(),
    );
    expect((chainAndTasks.details as SubagentDetails).status).toBe("invalid");
  });

  it("rejects batch entries with blank tasks", async () => {
    const tool = makeTool();
    const result = await tool.execute(
      "t1",
      { tasks: [{ task: "ok" }, { task: "   " }] },
      undefined,
      undefined,
      ctx(),
    );
    expect((result.details as SubagentDetails).status).toBe("invalid");
    expect(textOf(result)).toContain("non-empty");
  });

  it("rejects too many parallel tasks", async () => {
    const tool = makeTool();
    const result = await tool.execute(
      "t1",
      { tasks: Array.from({ length: 9 }, (_, i) => ({ task: `t${i}` })) },
      undefined,
      undefined,
      ctx(),
    );
    expect((result.details as SubagentDetails).status).toBe("invalid");
    expect(textOf(result)).toContain("Too many tasks");
  });

  it("rejects unknown agent names and lists available ones", async () => {
    const tool = makeTool();
    mkdirSync(join(dir, "agents"));
    writeFileSync(
      join(dir, "agents", "scout.md"),
      "---\nname: scout\ndescription: explorer\n---\nbody",
    );
    const result = await tool.execute(
      "t1",
      { task: "x", agent: "ghost" },
      undefined,
      undefined,
      ctx(),
    );
    expect((result.details as SubagentDetails).status).toBe("invalid");
    expect(textOf(result)).toContain("Unknown agent(s): ghost");
    expect(textOf(result)).toContain("scout");
  });
});

// Tool execute()'s ExtensionContext param; validation paths never touch it.
function ctx(): never {
  return undefined as never;
}

describe("summarizeArgs", () => {
  it("renders compact single-line JSON", () => {
    expect(summarizeArgs({ command: "ls -la" })).toBe('{"command":"ls -la"}');
  });

  it("drops empty and null args", () => {
    expect(summarizeArgs(undefined)).toBe("");
    expect(summarizeArgs(null)).toBe("");
    expect(summarizeArgs({})).toBe("");
  });

  it("truncates long arguments with an ellipsis", () => {
    const long = summarizeArgs({ command: "x".repeat(500) });
    expect(long.length).toBe(200);
    expect(long.endsWith("…")).toBe(true);
  });
});
