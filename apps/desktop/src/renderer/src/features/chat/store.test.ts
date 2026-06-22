import type { AppAgentEvent, AppMessage } from "@yui/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { emptyExtensionUi, type ActiveConversation } from "./types";
import { seedConversation, useChatStore } from "./store";

function active(sessionId: string, sessionPath: string): ActiveConversation {
  return {
    sessionId,
    sessionPath,
    title: sessionId,
    cwd: "/proj",
    thinkingLevel: "medium",
  };
}

function message(id: string, text: string): AppMessage {
  return {
    id,
    role: "assistant",
    content: [{ type: "text", text }],
    timestamp: 1,
  };
}

function resetStore() {
  useChatStore.setState({
    active: null,
    titlePending: false,
    titleRevealKey: 0,
    messages: [],
    liveTools: [],
    busy: false,
    queue: [],
    pendingUserId: null,
    activity: null,
    extensionUi: emptyExtensionUi(),
    messageStats: {},
    runTiming: {},
    realtimeBySessionId: {},
    sessionPathById: {},
    runningSessionPaths: [],
    input: "",
    loadingConversation: false,
    selectedModelKey: "",
    selectedCwd: "",
    selectedThinking: "medium",
  });
}

describe("chat store session cache", () => {
  beforeEach(() => {
    resetStore();
  });

  it("updates an inactive cached session without changing the visible session", () => {
    seedConversation({
      active: active("s1", "/sessions/s1.jsonl"),
      messages: [message("m1", "streaming")],
      busy: true,
    });
    useChatStore.getState().detachActiveConversation();
    seedConversation({
      active: active("s2", "/sessions/s2.jsonl"),
      messages: [message("m2", "visible")],
      busy: false,
    });

    const event: AppAgentEvent = { type: "agent_end", sessionId: "s1", willRetry: false };
    useChatStore.getState().applyEvent(event);

    const state = useChatStore.getState();
    expect(state.active?.sessionId).toBe("s2");
    expect(state.messages).toEqual([message("m2", "visible")]);
    expect(state.realtimeBySessionId.s1.busy).toBe(false);
    expect(state.runningSessionPaths).not.toContain("/sessions/s1.jsonl");
  });

  it("caches the visible session without clearing it mid-switch", () => {
    seedConversation({
      active: active("s1", "/sessions/s1.jsonl"),
      messages: [message("m1", "streaming")],
      busy: true,
    });

    // Snapshotting for a session switch must keep the current thread on screen
    // (no empty new-chat flash) while the target loads.
    useChatStore.getState().cacheActiveConversation();

    const state = useChatStore.getState();
    expect(state.active?.sessionId).toBe("s1");
    expect(state.messages).toEqual([message("m1", "streaming")]);
    expect(state.realtimeBySessionId.s1.busy).toBe(true);
    expect(state.runningSessionPaths).toContain("/sessions/s1.jsonl");
  });

  it("restores cached streaming content when switching back to a live session", () => {
    seedConversation({
      active: active("s1", "/sessions/s1.jsonl"),
      messages: [message("m1", "partial answer")],
      busy: true,
    });
    useChatStore.getState().detachActiveConversation();
    seedConversation({
      active: active("s2", "/sessions/s2.jsonl"),
      messages: [message("m2", "other chat")],
      busy: false,
    });

    const restored = useChatStore.getState().restoreCachedConversation({
      active: active("s1", "/sessions/s1.jsonl"),
      busy: true,
    });

    const state = useChatStore.getState();
    expect(restored).toBe(true);
    expect(state.active?.sessionId).toBe("s1");
    expect(state.messages).toEqual([message("m1", "partial answer")]);
    expect(state.busy).toBe(true);
  });
});
