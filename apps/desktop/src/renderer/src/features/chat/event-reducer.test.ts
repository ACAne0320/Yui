import { describe, expect, it } from "vitest";
import type { AppAgentEvent, AppMessage, ExtensionUiRequest } from "@yui/contracts";
import { reduceAgentEvent } from "./event-reducer";
import { emptyExtensionUi, type ChatRealtimeState } from "./types";

const userMessage: AppMessage = {
  id: "user-1",
  role: "user",
  content: [{ type: "text", text: "hello" }],
  timestamp: 1,
};

const base: ChatRealtimeState = {
  active: {
    sessionId: "active",
    sessionPath: "/a",
    title: "Title",
    cwd: "/tmp",
    thinkingLevel: "medium",
  },
  titlePending: false,
  titleRevealKey: 0,
  messages: [],
  liveTools: [],
  busy: false,
  queue: [],
  pendingUserId: null,
  activity: null,
  extensionUi: emptyExtensionUi(),
  extensionCommands: [],
  messageStats: {},
  runTiming: {},
};

function reduce(event: AppAgentEvent, state = base) {
  return reduceAgentEvent(state, event).state;
}

describe("reduceAgentEvent", () => {
  it("filters events from inactive sessions", () => {
    expect(reduce({ type: "agent_start", sessionId: "other" })).toBe(base);
  });

  it("tracks run lifecycle and refreshes the catalog", () => {
    expect(reduce({ type: "agent_start", sessionId: "active" }).busy).toBe(true);
    const result = reduceAgentEvent(
      { ...base, busy: true, liveTools: [{ toolCallId: "t", name: "x", args: {}, running: true }] },
      { type: "agent_end", sessionId: "active", willRetry: false },
    );
    expect(result.state.busy).toBe(false);
    expect(result.state.liveTools).toEqual([]);
    expect(result.effects).toContainEqual({ type: "refreshSessions" });
  });

  it("surfaces a failed run's error as a notice on agent_end", () => {
    // A bad API key ends the run with an assistant message whose stopReason is
    // "error"; agent_end mirrors its errorMessage into a one-shot notice so the
    // failure is not swallowed silently.
    const errored: AppMessage = {
      id: "a1",
      role: "assistant",
      content: [],
      stopReason: "error",
      errorMessage: "401 Unauthorized",
      timestamp: 0,
    };
    const result = reduceAgentEvent(
      { ...base, busy: true, messages: [errored] },
      { type: "agent_end", sessionId: "active", willRetry: false },
    );
    expect(result.state.busy).toBe(false);
    expect(result.effects).toContainEqual({ type: "notice", message: "401 Unauthorized" });
  });

  it("reconciles an optimistic user message", () => {
    const state = {
      ...base,
      pendingUserId: "local",
      messages: [{ ...userMessage, id: "local" }],
    };
    const next = reduce(
      { type: "message_start", sessionId: "active", message: userMessage },
      state,
    );
    expect(next.pendingUserId).toBeNull();
    expect(next.messages).toEqual([userMessage]);
  });

  it("tracks tool lifecycle and removes it when the tool result arrives", () => {
    const started = reduce({
      type: "tool_execution_start",
      sessionId: "active",
      toolCallId: "tool-1",
      toolName: "read",
      args: { path: "a" },
    });
    const updated = reduce(
      {
        type: "tool_execution_update",
        sessionId: "active",
        toolCallId: "tool-1",
        toolName: "read",
        partialResult: "partial",
      },
      started,
    );
    const ended = reduce(
      {
        type: "tool_execution_end",
        sessionId: "active",
        toolCallId: "tool-1",
        toolName: "read",
        result: "done",
        isError: false,
      },
      updated,
    );
    expect(ended.liveTools[0]).toMatchObject({ running: false, result: "done" });

    const toolResult: AppMessage = {
      id: "result",
      role: "toolResult",
      content: [{ type: "text", text: "done" }],
      toolCallId: "tool-1",
      timestamp: 2,
    };
    expect(
      reduce({ type: "message_end", sessionId: "active", message: toolResult }, ended).liveTools,
    ).toEqual([]);
  });

  it("tracks queue, thinking level, compaction, retries, and errors", () => {
    const queued = reduce({
      type: "queue_update",
      sessionId: "active",
      steering: ["now"],
      followUp: ["later"],
    });
    expect(queued.queue).toEqual(["now", "later"]);
    expect(
      reduce({ type: "thinking_level_changed", sessionId: "active", level: "high" }).active
        ?.thinkingLevel,
    ).toBe("high");
    expect(
      reduce({ type: "compaction_start", sessionId: "active", reason: "threshold" }).activity,
    ).toEqual({ type: "compacting" });
    expect(
      reduce({
        type: "auto_retry_start",
        sessionId: "active",
        attempt: 1,
        maxAttempts: 3,
        delayMs: 10,
        errorMessage: "x",
      }).activity,
    ).toEqual({ type: "retrying", attempt: 1, maxAttempts: 3 });
    // Extension errors are non-fatal: the notice surfaces but the run (and its
    // busy indicator) continues; agent_end owns the busy lifecycle.
    const errored = reduceAgentEvent(
      { ...base, busy: true },
      { type: "error", sessionId: "active", message: "boom" },
    );
    expect(errored.state.busy).toBe(true);
    expect(errored.effects).toContainEqual({ type: "notice", message: "boom" });
  });

  it("clears busy and indicators on agent_settled as a safety net", () => {
    const result = reduceAgentEvent(
      {
        ...base,
        busy: true,
        activity: { type: "compacting" },
        liveTools: [{ toolCallId: "t", name: "x", args: {}, running: true }],
      },
      { type: "agent_settled", sessionId: "active" },
    );
    expect(result.state.busy).toBe(false);
    expect(result.state.activity).toBeNull();
    expect(result.state.liveTools).toEqual([]);
    expect(result.effects).toEqual([]);
  });

  it("surfaces the context shrink on a successful compaction", () => {
    const result = reduceAgentEvent(
      { ...base, activity: { type: "compacting" } },
      {
        type: "compaction_end",
        sessionId: "active",
        reason: "threshold",
        aborted: false,
        willRetry: false,
        tokensBefore: 128000,
        estimatedTokensAfter: 41000,
      },
    );
    expect(result.state.activity).toBeNull();
    expect(result.effects).toEqual([
      { type: "notice", message: "Context compacted: 128k → ~41k tokens" },
    ]);
  });

  it("stays silent after compactions without a result and surfaces failures", () => {
    const quiet = reduceAgentEvent(base, {
      type: "compaction_end",
      sessionId: "active",
      reason: "manual",
      aborted: false,
      willRetry: false,
    });
    expect(quiet.effects).toEqual([]);

    const failed = reduceAgentEvent(base, {
      type: "compaction_end",
      sessionId: "active",
      reason: "overflow",
      aborted: false,
      willRetry: true,
      errorMessage: "summary request failed",
      tokensBefore: 128000,
      estimatedTokensAfter: 41000,
    });
    expect(failed.effects).toEqual([{ type: "notice", message: "summary request failed" }]);
  });

  it("emits notices as one-shot effects, not state", () => {
    const failed = reduceAgentEvent(base, {
      type: "auto_retry_end",
      sessionId: "active",
      success: false,
      attempt: 3,
      finalError: "gave up",
    });
    expect(failed.effects).toEqual([{ type: "notice", message: "gave up" }]);
    const succeeded = reduceAgentEvent(base, {
      type: "auto_retry_end",
      sessionId: "active",
      success: true,
      attempt: 2,
    });
    expect(succeeded.effects).toEqual([]);
  });

  it("queues extension dialogs FIFO, dedupes by requestId, and removes on dismiss", () => {
    const confirm: ExtensionUiRequest = {
      requestId: "r1",
      kind: "confirm",
      title: "Allow?",
      message: "Run?",
    };
    const select: ExtensionUiRequest = {
      requestId: "r2",
      kind: "select",
      title: "Pick",
      options: ["a"],
    };
    const one = reduce({ type: "extension_ui_request", sessionId: "active", request: confirm });
    const both = reduce(
      { type: "extension_ui_request", sessionId: "active", request: select },
      one,
    );
    expect(both.extensionUi.pendingRequests.map((r) => r.requestId)).toEqual(["r1", "r2"]);

    const deduped = reduce(
      { type: "extension_ui_request", sessionId: "active", request: confirm },
      both,
    );
    expect(deduped.extensionUi.pendingRequests).toHaveLength(2);

    const dismissed = reduce(
      { type: "extension_ui_dismiss", sessionId: "active", requestId: "r1", reason: "timeout" },
      both,
    );
    expect(dismissed.extensionUi.pendingRequests.map((r) => r.requestId)).toEqual(["r2"]);
  });

  it("overwrites statuses and widgets by key and removes them on undefined", () => {
    const a = reduce({
      type: "extension_status_changed",
      sessionId: "active",
      key: "vim",
      text: "NORMAL",
    });
    const b = reduce(
      { type: "extension_status_changed", sessionId: "active", key: "clock", text: "12:00" },
      a,
    );
    const c = reduce(
      { type: "extension_status_changed", sessionId: "active", key: "vim", text: "INSERT" },
      b,
    );
    expect(c.extensionUi.statuses).toEqual([
      { key: "vim", text: "INSERT" },
      { key: "clock", text: "12:00" },
    ]);
    const removed = reduce(
      { type: "extension_status_changed", sessionId: "active", key: "vim" },
      c,
    );
    expect(removed.extensionUi.statuses).toEqual([{ key: "clock", text: "12:00" }]);

    const widget = reduce({
      type: "extension_widget_changed",
      sessionId: "active",
      key: "todo",
      lines: ["[ ] a"],
      placement: "belowEditor",
    });
    const replaced = reduce(
      {
        type: "extension_widget_changed",
        sessionId: "active",
        key: "todo",
        lines: ["[x] a"],
        placement: "belowEditor",
      },
      widget,
    );
    expect(replaced.extensionUi.widgets).toEqual([
      { key: "todo", lines: ["[x] a"], placement: "belowEditor" },
    ]);
    const cleared = reduce(
      {
        type: "extension_widget_changed",
        sessionId: "active",
        key: "todo",
        placement: "belowEditor",
      },
      replaced,
    );
    expect(cleared.extensionUi.widgets).toEqual([]);
  });

  it("tracks extension title and working message, and routes notices/editor text as effects", () => {
    expect(
      reduce({ type: "extension_title_changed", sessionId: "active", title: "T" }).extensionUi
        .title,
    ).toBe("T");
    const working = reduce({
      type: "extension_working_message_changed",
      sessionId: "active",
      message: "Crunching…",
    });
    expect(working.extensionUi.workingMessage).toBe("Crunching…");
    expect(
      reduce({ type: "extension_working_message_changed", sessionId: "active" }, working)
        .extensionUi.workingMessage,
    ).toBeUndefined();

    expect(
      reduceAgentEvent(base, {
        type: "extension_notice",
        sessionId: "active",
        message: "hi",
        level: "info",
      }).effects,
    ).toEqual([{ type: "notice", message: "hi" }]);
    expect(
      reduceAgentEvent(base, {
        type: "extension_editor_set_text",
        sessionId: "active",
        text: "draft",
      }).effects,
    ).toEqual([{ type: "setEditorText", text: "draft" }]);
  });

  it("measures one complete user run across internal tool turns", () => {
    const first: AppMessage = { id: "a1", role: "assistant", content: [], timestamp: 0 };
    const final: AppMessage = {
      id: "a2",
      role: "assistant",
      content: [{ type: "text", text: "done" }],
      timestamp: 0,
    };
    const at = (state: ChatRealtimeState, event: AppAgentEvent, now: number) =>
      reduceAgentEvent(state, event, now).state;

    let state = at(base, { type: "agent_start", sessionId: "active" }, 1_000);
    state = at(state, { type: "turn_start", sessionId: "active" }, 1_100);
    state = at(state, { type: "message_end", sessionId: "active", message: first }, 4_000);
    state = at(
      state,
      { type: "turn_end", sessionId: "active", message: first, toolResults: [] },
      4_500,
    );
    expect(state.messageStats).toEqual({});
    state = at(state, { type: "agent_end", sessionId: "active", willRetry: true }, 4_700);
    state = at(state, { type: "agent_start", sessionId: "active" }, 5_000);
    state = at(state, { type: "turn_start", sessionId: "active" }, 5_000);
    state = at(state, { type: "message_end", sessionId: "active", message: final }, 9_000);
    state = at(state, { type: "agent_end", sessionId: "active", willRetry: false }, 9_500);
    expect(state.messageStats).toEqual({ a2: { runMs: 8_500 } });
  });

  it("ignores agent_end without a prior agent_start", () => {
    const assistant: AppMessage = { id: "a1", role: "assistant", content: [], timestamp: 0 };
    const seeded = { ...base, messages: [assistant] };
    const next = reduceAgentEvent(
      seeded,
      { type: "agent_end", sessionId: "active", willRetry: false },
      200,
    ).state;
    expect(next.messageStats.a1).toBeUndefined();
  });

  it("does not duplicate messages from turn_end snapshots", () => {
    const rendered: AppMessage = {
      id: "message-end-id",
      role: "assistant",
      content: [{ type: "text", text: "done" }],
      timestamp: 3,
    };
    const turnEndSnapshot = { ...rendered, id: "turn-end-id" };
    expect(
      reduce(
        {
          type: "turn_end",
          sessionId: "active",
          message: turnEndSnapshot,
          toolResults: [],
        },
        { ...base, messages: [rendered] },
      ).messages,
    ).toEqual([rendered]);
  });
});
