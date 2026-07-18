import type { AppAgentEvent, AppMessage } from "@yui/contracts";
import { describe, expect, it } from "vitest";
import { renderEvent, renderHistory } from "./render.ts";

function render(event: AppAgentEvent): string {
  let out = "";
  renderEvent(event, (chunk) => {
    out += chunk;
  });
  return out;
}

function renderMsgs(messages: AppMessage[]): string {
  let out = "";
  renderHistory(messages, (chunk) => {
    out += chunk;
  });
  return out;
}

describe("renderEvent", () => {
  it("writes streamed text deltas verbatim", () => {
    expect(
      render({
        type: "message_update",
        sessionId: "s1",
        message: { id: "m1", role: "assistant", content: [], timestamp: 1 },
        stream: { kind: "text_delta", contentIndex: 0, delta: "Hello" },
      }),
    ).toBe("Hello");
  });

  it("does not render text for non-text stream events", () => {
    expect(
      render({
        type: "message_update",
        sessionId: "s1",
        message: { id: "m1", role: "assistant", content: [], timestamp: 1 },
        stream: { kind: "toolcall_delta", contentIndex: 0, delta: "{" },
      }),
    ).toBe("");
  });

  it("renders a tool end line containing the tool name", () => {
    const ok = render({
      type: "tool_execution_end",
      sessionId: "s1",
      toolCallId: "t1",
      toolName: "read",
      result: {},
      isError: false,
    });
    expect(ok).toContain("read");
    const failed = render({
      type: "tool_execution_end",
      sessionId: "s1",
      toolCallId: "t1",
      toolName: "read",
      result: {},
      isError: true,
    });
    expect(failed).toContain("failed");
  });

  it("renders compaction progress and the size estimate", () => {
    expect(render({ type: "compaction_start", sessionId: "s1", reason: "threshold" })).toContain(
      "compacting context (threshold)",
    );

    const done = render({
      type: "compaction_end",
      sessionId: "s1",
      reason: "threshold",
      aborted: false,
      willRetry: false,
      tokensBefore: 128000,
      estimatedTokensAfter: 41000,
    });
    expect(done).toContain("128000 → ~41000 tokens");

    const failed = render({
      type: "compaction_end",
      sessionId: "s1",
      reason: "overflow",
      aborted: false,
      willRetry: true,
      errorMessage: "boom",
    });
    expect(failed).toContain("compaction failed: boom");
  });

  it("ignores lifecycle events with no inline output", () => {
    expect(render({ type: "agent_start", sessionId: "s1" })).toBe("");
    expect(render({ type: "turn_start", sessionId: "s1" })).toBe("");
    expect(render({ type: "agent_settled", sessionId: "s1" })).toBe("");
  });
});

describe("renderHistory", () => {
  const msg = (m: Partial<AppMessage> & Pick<AppMessage, "role">): AppMessage => ({
    id: "x",
    content: [],
    timestamp: 0,
    ...m,
  });

  it("labels a compaction summary and shows its text instead of a blank line", () => {
    const out = renderMsgs([
      msg({
        role: "compactionSummary",
        tokensBefore: 1234,
        content: [{ type: "text", text: "earlier conversation" }],
      }),
    ]);
    expect(out).toContain("[compaction]");
    expect(out).toContain("1234");
    expect(out).toContain("earlier conversation");
  });

  it("labels a branch summary with its text", () => {
    const out = renderMsgs([
      msg({ role: "branchSummary", content: [{ type: "text", text: "abandoned path" }] }),
    ]);
    expect(out).toContain("[branch]");
    expect(out).toContain("abandoned path");
  });

  it("renders a bash execution with command, output, and exit status", () => {
    const out = renderMsgs([
      msg({
        role: "bashExecution",
        command: "ls -a",
        content: [{ type: "text", text: "file1" }],
        exitCode: 2,
        isError: true,
      }),
    ]);
    expect(out).toContain("$ ls -a");
    expect(out).toContain("file1");
    expect(out).toContain("exit 2");
  });

  it("labels a displayed custom message and skips a hidden (empty) one", () => {
    const shown = renderMsgs([
      msg({ role: "custom", customType: "note", content: [{ type: "text", text: "hi" }] }),
    ]);
    expect(shown).toContain("[note]");
    expect(shown).toContain("hi");
    // A hidden custom arrives with empty content and must produce nothing.
    expect(renderMsgs([msg({ role: "custom", customType: "state" })])).toBe("");
  });
});
