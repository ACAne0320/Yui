import type { AgentSession, AgentSessionServices } from "@earendil-works/pi-coding-agent";
import type { AppAgentEvent } from "@yui/contracts";
import { describe, expect, it } from "vitest";
import { SessionPool } from "./session-pool.ts";

const fakeServices = {} as AgentSessionServices;

// Minimal stand-in for AgentSession: only the members SessionPool touches.
class FakeSession {
  isStreaming = false;
  disposed = false;
  readonly sessionManager: { getSessionFile: () => string | undefined };
  private readonly listeners = new Set<(event: unknown) => void>();

  constructor(
    readonly sessionId = "s1",
    sessionPath = `/tmp/${sessionId}.jsonl`,
  ) {
    this.sessionManager = { getSessionFile: () => sessionPath };
  }

  subscribe(listener: (event: unknown) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: unknown): void {
    for (const listener of this.listeners) listener(event);
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }
}

function asSession(fake: FakeSession): AgentSession {
  return fake as unknown as AgentSession;
}

describe("SessionPool", () => {
  it("fans Pi events through the mapper to per-session listeners", () => {
    const fake = new FakeSession();
    const pool = new SessionPool();
    pool.add(asSession(fake), fakeServices);

    const received: AppAgentEvent[] = [];
    pool.subscribe("s1", (event) => received.push(event));

    fake.emit({ type: "agent_start" });
    fake.emit({
      type: "message_update",
      message: {
        role: "assistant",
        content: [],
        api: "x",
        provider: "anthropic",
        model: "m",
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "stop",
        timestamp: 1,
      },
      assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "hi", partial: {} },
    });

    expect(received).toEqual([
      { type: "agent_start", sessionId: "s1" },
      expect.objectContaining({
        type: "message_update",
        sessionId: "s1",
        stream: { kind: "text_delta", contentIndex: 0, delta: "hi" },
      }),
    ]);
  });

  it("stops delivery after unsubscribe", () => {
    const fake = new FakeSession();
    const pool = new SessionPool();
    pool.add(asSession(fake), fakeServices);

    const received: AppAgentEvent[] = [];
    const unsubscribe = pool.subscribe("s1", (event) => received.push(event));

    fake.emit({ type: "turn_start" });
    unsubscribe();
    fake.emit({ type: "turn_start" });

    expect(received).toHaveLength(1);
  });

  it("reflects busy state and disposes the Pi session on close", async () => {
    const fake = new FakeSession();
    const pool = new SessionPool();
    pool.add(asSession(fake), fakeServices);

    expect(pool.isBusy("s1")).toBe(false);
    fake.isStreaming = true;
    expect(pool.isBusy("s1")).toBe(true);

    await pool.close("s1");
    expect(fake.disposed).toBe(true);
    expect(pool.has("s1")).toBe(false);
  });

  it("finds and clears live sessions by session file path", async () => {
    const fake = new FakeSession("s1", "/tmp/yui-session.jsonl");
    const pool = new SessionPool();
    pool.add(asSession(fake), fakeServices);

    expect(pool.findBySessionPath("/tmp/yui-session.jsonl")?.session).toBe(asSession(fake));

    await pool.close("s1");
    expect(pool.findBySessionPath("/tmp/yui-session.jsonl")).toBeUndefined();
  });

  it("emits bridge events through the same fan-out and disposes the bridge on close", async () => {
    const fake = new FakeSession();
    const pool = new SessionPool();
    const bridge = pool.add(asSession(fake), fakeServices);

    const received: AppAgentEvent[] = [];
    pool.subscribe("s1", (event) => received.push(event));

    const confirmed = bridge.confirm("Allow?", "Run?");
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ type: "extension_ui_request", sessionId: "s1" });

    await pool.close("s1");
    await expect(confirmed).resolves.toBe(false);
    expect(received.at(-1)).toMatchObject({ type: "extension_ui_dismiss", reason: "closed" });
  });

  it("throws unknown_session for operations on a missing session", () => {
    const pool = new SessionPool();
    expect(() => pool.subscribe("nope", () => {})).toThrowError(/Unknown session/);
    expect(() => pool.getSession("nope")).toThrowError(/Unknown session/);
  });
});
