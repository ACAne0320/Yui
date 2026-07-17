import { describe, expect, it } from "vitest";
import type { AppMessage } from "@yui/contracts";
import {
  buildTurnSegments,
  conversationTurns,
  finalReply,
  formatDuration,
  groupToolSegments,
  runDurationMs,
  sessionGroup,
  TEMP_GROUP_KEY,
  type ToolSegment,
  type TurnSegment,
} from "./lib";

function message(id: string, role: AppMessage["role"]): AppMessage {
  return {
    id,
    role,
    content: [],
    timestamp: 1,
  };
}

describe("conversation turns", () => {
  it("groups execution messages under the preceding user request", () => {
    const grouped = conversationTurns([
      message("system-1", "custom"),
      message("user-1", "user"),
      message("assistant-1", "assistant"),
      message("tool-1", "toolResult"),
      message("user-2", "user"),
      message("assistant-2", "assistant"),
    ]);

    expect(grouped.leading.map((item) => item.id)).toEqual(["system-1"]);
    expect(grouped.turns.map((turn) => turn.messages.map((item) => item.id))).toEqual([
      ["assistant-1", "tool-1"],
      ["assistant-2"],
    ]);
  });

  it("selects only a terminal assistant message as the final reply", () => {
    const intermediate = {
      ...message("assistant-1", "assistant"),
      content: [{ type: "text" as const, text: "checking" }],
      stopReason: "toolUse" as const,
    };
    const final = {
      ...message("assistant-2", "assistant"),
      content: [{ type: "text" as const, text: "done" }],
      completedAt: 4_000,
    };
    expect(finalReply([intermediate, final])).toBe(final);
    expect(runDurationMs({ ...message("user", "user"), timestamp: 1_000 }, final)).toBe(3_000);
    expect(runDurationMs(message("user", "user"), final, 2_500)).toBe(2_500);
  });

  it("with requireSettled, defers a still-streaming reply until its stopReason settles", () => {
    // A pre-tool-call preamble streaming in: text present, no toolCall yet, no
    // stopReason. Without the guard it matches (the old bubble→chain flicker).
    const streaming = {
      ...message("assistant-1", "assistant"),
      content: [{ type: "text" as const, text: "let me build this" }],
    };
    expect(finalReply([streaming])).toBe(streaming);
    expect(finalReply([streaming], true)).toBeUndefined();

    // Once it settles as a terminal text reply it is promoted again.
    const settled = { ...streaming, stopReason: "stop" as const };
    expect(finalReply([settled], true)).toBe(settled);
  });

  it("promotes a failed run's error message even without text content", () => {
    // A bad API key (or rate limit / network failure) ends the run with an
    // assistant message that carries an errorMessage but no text; it must still
    // be selected as the reply so the error renders instead of vanishing.
    const errored = {
      ...message("assistant-1", "assistant"),
      stopReason: "error" as const,
      errorMessage: "401 Unauthorized",
    };
    expect(finalReply([errored])).toBe(errored);
    expect(finalReply([errored], true)).toBe(errored);
  });

  it("adds hours only for runs longer than an hour", () => {
    const t = (key: string, values?: Record<string, unknown>) =>
      key === "chat.duration.hours"
        ? `${values?.hours}h ${values?.minutes}m ${values?.seconds}s`
        : key === "chat.duration.minutes"
          ? `${values?.minutes}m ${values?.seconds}s`
          : `${values?.value}s`;
    expect(formatDuration(4_900, t)).toBe("4s");
    expect(formatDuration(61_000, t)).toBe("1m 1s");
    expect(formatDuration(3_661_000, t)).toBe("1h 1m 1s");
  });
});

describe("buildTurnSegments tool arguments", () => {
  const toolCall = (args: Record<string, unknown>): AppMessage => ({
    ...message("assistant-1", "assistant" as const),
    content: [{ type: "toolCall" as const, id: "call-1", name: "read", arguments: args }],
  });

  it("withholds a tool call's command while its arguments are still streaming", () => {
    // Live run, no execution, no result — the JSON arguments are partial, so the
    // command must not be rendered yet.
    const segments = buildTurnSegments([toolCall({ path: "/Users/shi" })], [], true, undefined);
    const tool = segments.find((segment) => segment.kind === "tool");
    expect(tool?.kind === "tool" && tool.args).toBeUndefined();
  });

  it("still withholds it when the provider sets stopReason mid-stream", () => {
    // Some providers (e.g. DeepSeek) set stopReason while the call is still
    // streaming, so stopReason must not be treated as "arguments complete".
    const early = { ...toolCall({ path: "/Users/shi" }), stopReason: "toolUse" as const };
    const tool = buildTurnSegments([early], [], true, undefined).find(
      (segment) => segment.kind === "tool",
    );
    expect(tool?.kind === "tool" && tool.args).toBeUndefined();
  });

  it("shows the command once the arguments are complete", () => {
    // Run no longer live (persisted history) → arguments are final.
    const fromPersisted = buildTurnSegments(
      [toolCall({ path: "/Users/shino" })],
      [],
      false,
      undefined,
    ).find((segment) => segment.kind === "tool");
    expect(fromPersisted?.kind === "tool" && fromPersisted.args).toEqual({ path: "/Users/shino" });

    // Or the moment execution starts with the whole args, even mid-stream.
    const live = [
      { toolCallId: "call-1", name: "read", args: { path: "/Users/shino" }, running: true },
    ];
    const fromLive = buildTurnSegments(
      [toolCall({ path: "/Users/sh" })],
      live,
      true,
      undefined,
    ).find((segment) => segment.kind === "tool");
    expect(fromLive?.kind === "tool" && fromLive.args).toEqual({ path: "/Users/shino" });
  });
});

describe("groupToolSegments", () => {
  const tool = (id: string, name = "bash"): ToolSegment => ({
    kind: "tool",
    id,
    name,
    detail: undefined,
    running: false,
  });

  it("folds consecutive plain tool calls into one group keyed by the first call", () => {
    expect(groupToolSegments([tool("a"), tool("b"), tool("c")])).toEqual([
      { kind: "toolGroup", id: "a", tools: [tool("a"), tool("b"), tool("c")] },
    ]);
  });

  it("breaks a run around prose, reasoning, and message segments", () => {
    const prose: TurnSegment = { kind: "prose", id: "p", text: "note", live: false };
    const reasoning: TurnSegment = { kind: "reasoning", id: "r", text: "hmm" };
    const segments = groupToolSegments([
      tool("a"),
      tool("b"),
      prose,
      tool("c"),
      reasoning,
      tool("d"),
      tool("e"),
    ]);
    expect(segments.map((segment) => segment.kind)).toEqual([
      "toolGroup",
      "prose",
      "tool",
      "reasoning",
      "toolGroup",
    ]);
    const last = segments.at(-1);
    expect(last?.kind === "toolGroup" && last.tools.map((item) => item.id)).toEqual(["d", "e"]);
  });

  it("keeps a lone tool call standalone", () => {
    expect(groupToolSegments([tool("a")])).toEqual([tool("a")]);
  });

  it("keeps richly-rendered tools standalone and breaks runs around them", () => {
    const segments = groupToolSegments([
      tool("a"),
      tool("b"),
      tool("s", "subagent"),
      tool("c"),
      tool("d"),
      tool("m", "remember"),
    ]);
    expect(segments.map((segment) => segment.kind)).toEqual([
      "toolGroup",
      "tool",
      "toolGroup",
      "tool",
    ]);
    expect(segments[1]?.kind === "tool" && segments[1].id).toBe("s");
    expect(segments[3]?.kind === "tool" && segments[3].id).toBe("m");
  });

  it("returns an empty list for empty input", () => {
    expect(groupToolSegments([])).toEqual([]);
  });
});

const isScratch = (path: string) => path.startsWith("/home/me/scratch/");

describe("sessionGroup", () => {
  it("collapses every scratch workspace into one temporary bucket", () => {
    expect(sessionGroup("/home/me/scratch/abc", "workspace", 0, isScratch)).toBe(TEMP_GROUP_KEY);
    expect(sessionGroup("/home/me/scratch/xyz", "workspace", 0, isScratch)).toBe(TEMP_GROUP_KEY);
  });

  it("keeps real workspaces grouped by their path", () => {
    expect(sessionGroup("/home/me/projects/app", "workspace", 0, isScratch)).not.toBe(
      TEMP_GROUP_KEY,
    );
  });

  it("ignores scratch detection when grouping by time", () => {
    const today = sessionGroup("/home/me/scratch/abc", "time", Date.now(), isScratch);
    expect(today).toBe("today");
  });
});
