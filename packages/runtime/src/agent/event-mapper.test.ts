import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { AgentEventMapper } from "./event-mapper.ts";

const sessionId = "s1";

// Deterministic id generator so we can assert id threading across events.
function makeMapper(onUnmapped?: (type: string, event: unknown) => void): AgentEventMapper {
  let n = 0;
  return new AgentEventMapper({ sessionId, generateId: () => `m${++n}`, onUnmapped });
}

const usage = {
  input: 10,
  output: 20,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 30,
  cost: { input: 0.1, output: 0.2, cacheRead: 0, cacheWrite: 0, total: 0.3 },
};

function assistant(content: unknown[]) {
  return {
    role: "assistant",
    content,
    api: "anthropic",
    provider: "anthropic",
    model: "claude-x",
    usage,
    stopReason: "stop",
    timestamp: 100,
  };
}

// Build an AgentSessionEvent literal without fighting Pi's exact field types;
// the mapper only reads the fields asserted below.
function ev(event: unknown): AgentSessionEvent {
  return event as AgentSessionEvent;
}

describe("AgentEventMapper", () => {
  it("threads one synthetic id across message_start -> message_update -> message_end", () => {
    const m = makeMapper();

    const started = m.map(ev({ type: "message_start", message: assistant([]) }));
    expect(started).toEqual([
      {
        type: "message_start",
        sessionId,
        message: expect.objectContaining({ id: "m1", role: "assistant" }),
      },
    ]);

    const updated = m.map(
      ev({
        type: "message_update",
        message: assistant([{ type: "text", text: "Hel" }]),
        assistantMessageEvent: {
          type: "text_delta",
          contentIndex: 0,
          delta: "Hel",
          partial: assistant([]),
        },
      }),
    );
    expect(updated).toEqual([
      {
        type: "message_update",
        sessionId,
        message: expect.objectContaining({ id: "m1" }),
        stream: { kind: "text_delta", contentIndex: 0, delta: "Hel" },
      },
    ]);

    const ended = m.map(
      ev({ type: "message_end", message: assistant([{ type: "text", text: "Hello" }]) }),
    );
    expect(ended).toEqual([
      { type: "message_end", sessionId, message: expect.objectContaining({ id: "m1" }) },
    ]);
  });

  it("unwraps every content-level AssistantMessageEvent into a stream event", () => {
    const m = makeMapper();
    m.map(ev({ type: "message_start", message: assistant([]) }));

    const cases: Array<[Record<string, unknown>, Record<string, unknown>]> = [
      [
        { type: "text_start", contentIndex: 0 },
        { kind: "text_start", contentIndex: 0 },
      ],
      [
        { type: "thinking_delta", contentIndex: 1, delta: "hm" },
        { kind: "thinking_delta", contentIndex: 1, delta: "hm" },
      ],
      [
        {
          type: "toolcall_end",
          contentIndex: 2,
          toolCall: { id: "tc1", name: "read", arguments: {} },
        },
        { kind: "toolcall_end", contentIndex: 2, toolCallId: "tc1" },
      ],
    ];

    for (const [inner, expected] of cases) {
      const out = m.map(
        ev({
          type: "message_update",
          message: assistant([]),
          assistantMessageEvent: { ...inner, partial: assistant([]) },
        }),
      );
      expect(out[0]).toMatchObject({ type: "message_update", stream: expected });
    }
  });

  it("drops message_update carrying start/done/error (never routed there by Pi)", () => {
    const onUnmapped = vi.fn();
    const m = makeMapper(onUnmapped);

    const out = m.map(
      ev({
        type: "message_update",
        message: assistant([]),
        assistantMessageEvent: { type: "done", reason: "stop", message: assistant([]) },
      }),
    );

    expect(out).toEqual([]);
    expect(onUnmapped).toHaveBeenCalledWith("message_update:done", expect.anything());
  });

  it("maps tool execution end with its payload", () => {
    const out = makeMapper().map(
      ev({
        type: "tool_execution_end",
        toolCallId: "t1",
        toolName: "read",
        result: { ok: true },
        isError: false,
      }),
    );
    expect(out).toEqual([
      {
        type: "tool_execution_end",
        sessionId,
        toolCallId: "t1",
        toolName: "read",
        result: { ok: true },
        isError: false,
      },
    ]);
  });

  it("maps tool-result messages in turn_end (toolCallId / isError preserved)", () => {
    const out = makeMapper().map(
      ev({
        type: "turn_end",
        message: assistant([{ type: "text", text: "done" }]),
        toolResults: [
          {
            role: "toolResult",
            toolCallId: "t1",
            toolName: "read",
            content: [{ type: "text", text: "file body" }],
            isError: false,
            timestamp: 1,
          },
        ],
      }),
    );
    expect(out[0]).toMatchObject({
      type: "turn_end",
      toolResults: [
        {
          role: "toolResult",
          toolCallId: "t1",
          toolName: "read",
          isError: false,
          content: [{ type: "text", text: "file body" }],
        },
      ],
    });
  });

  it("copies the steering / follow-up queues defensively", () => {
    const steering = ["s"];
    const followUp = ["f"];
    const out = makeMapper().map(ev({ type: "queue_update", steering, followUp }));

    expect(out).toEqual([{ type: "queue_update", sessionId, steering: ["s"], followUp: ["f"] }]);
    // Mutating the source must not affect the mapped event.
    steering.push("mutated");
    expect(out[0]).toMatchObject({ steering: ["s"] });
  });

  it("drops unknown future events without crashing and reports them", () => {
    const onUnmapped = vi.fn();
    const out = makeMapper(onUnmapped).map(ev({ type: "some_future_event", foo: 1 }));

    expect(out).toEqual([]);
    expect(onUnmapped).toHaveBeenCalledWith("some_future_event", expect.anything());
  });

  it("maps agent_settled as the authoritative idle signal", () => {
    const out = makeMapper().map(ev({ type: "agent_settled" }));
    expect(out).toEqual([{ type: "agent_settled", sessionId }]);
  });

  it("passes compaction token estimates through compaction_end", () => {
    const out = makeMapper().map(
      ev({
        type: "compaction_end",
        reason: "threshold",
        aborted: false,
        willRetry: false,
        result: {
          summary: "…",
          firstKeptEntryId: "e1",
          tokensBefore: 128000,
          estimatedTokensAfter: 41000,
        },
      }),
    );

    expect(out).toEqual([
      {
        type: "compaction_end",
        sessionId,
        reason: "threshold",
        aborted: false,
        willRetry: false,
        errorMessage: undefined,
        tokensBefore: 128000,
        estimatedTokensAfter: 41000,
      },
    ]);
  });

  it("leaves compaction token fields absent when the run produced no result", () => {
    const out = makeMapper().map(
      ev({ type: "compaction_end", reason: "manual", aborted: true, willRetry: false }),
    );

    expect(out).toEqual([
      {
        type: "compaction_end",
        sessionId,
        reason: "manual",
        aborted: true,
        willRetry: false,
        errorMessage: undefined,
        tokensBefore: undefined,
        estimatedTokensAfter: undefined,
      },
    ]);
  });

  it("drops display-only entry_appended events", () => {
    const onUnmapped = vi.fn();
    const out = makeMapper(onUnmapped).map(ev({ type: "entry_appended", entry: {} }));

    expect(out).toEqual([]);
    expect(onUnmapped).not.toHaveBeenCalled();
  });
});
