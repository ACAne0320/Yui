import type { AppAgentEvent, AppMessage, ThinkingLevel } from "@yui/contracts";
import { create } from "zustand";
import { reduceAgentEvent, type ChatEventEffect } from "./event-reducer";
import {
  emptyExtensionUi,
  type ActiveConversation,
  type ChatRealtimeState,
  type ComposerAttachment,
  type LiveTool,
} from "./types";

interface ChatState extends ChatRealtimeState {
  realtimeBySessionId: Record<string, ChatRealtimeState>;
  sessionPathById: Record<string, string>;
  runningSessionPaths: string[];
  input: string;
  attachments: ComposerAttachment[];
  loadingConversation: boolean;
  selectedModelKey: string;
  selectedCwd: string;
  selectedThinking: ThinkingLevel;
  /** Sticky new-chat preference: open the next session without persona memory. */
  noMemory: boolean;
  setInput: (input: string) => void;
  setAttachments: (attachments: ComposerAttachment[]) => void;
  setLoadingConversation: (loading: boolean) => void;
  setSelectedCwd: (cwd: string) => void;
  setSelectedThinking: (thinking: ThinkingLevel) => void;
  setNoMemory: (noMemory: boolean) => void;
  cacheActiveConversation: () => void;
  detachActiveConversation: () => void;
  forgetConversation: (sessionId: string) => void;
  getCachedSessionIdByPath: (sessionPath: string) => string | undefined;
  restoreCachedConversation: (input: { active: ActiveConversation; busy: boolean }) => boolean;
  resetConversation: (patch?: Partial<ChatState>) => void;
  applyEvent: (event: AppAgentEvent) => ChatEventEffect[];
}

const realtimeInitial: ChatRealtimeState = {
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
  extensionCommands: [],
  messageStats: {},
  runTiming: {},
};

function blankRealtime(): ChatRealtimeState {
  return { ...realtimeInitial, extensionUi: emptyExtensionUi() };
}

function visibleRealtime(state: ChatState): ChatRealtimeState {
  return {
    active: state.active,
    titlePending: state.titlePending,
    titleRevealKey: state.titleRevealKey,
    messages: state.messages,
    liveTools: state.liveTools,
    busy: state.busy,
    queue: state.queue,
    pendingUserId: state.pendingUserId,
    activity: state.activity,
    extensionUi: state.extensionUi,
    extensionCommands: state.extensionCommands,
    messageStats: state.messageStats,
    runTiming: state.runTiming,
  };
}

function withRunningPath(paths: string[], sessionPath: string | undefined, running: boolean) {
  if (!sessionPath) return paths;
  const exists = paths.includes(sessionPath);
  if (running && !exists) return [...paths, sessionPath];
  if (!running && exists) return paths.filter((path) => path !== sessionPath);
  return paths;
}

function cacheRealtime(state: ChatState, realtime: ChatRealtimeState) {
  const active = realtime.active;
  const sessionId = active?.sessionId;
  if (!sessionId) {
    return {
      realtimeBySessionId: state.realtimeBySessionId,
      sessionPathById: state.sessionPathById,
      runningSessionPaths: state.runningSessionPaths,
    };
  }

  const sessionPath = active.sessionPath;
  return {
    realtimeBySessionId: { ...state.realtimeBySessionId, [sessionId]: realtime },
    sessionPathById: sessionPath
      ? { ...state.sessionPathById, [sessionId]: sessionPath }
      : state.sessionPathById,
    runningSessionPaths: withRunningPath(state.runningSessionPaths, sessionPath, realtime.busy),
  };
}

export const useChatStore = create<ChatState>((set, get) => ({
  ...realtimeInitial,
  realtimeBySessionId: {},
  sessionPathById: {},
  runningSessionPaths: [],
  input: "",
  attachments: [],
  loadingConversation: false,
  selectedModelKey: "",
  selectedCwd: "",
  selectedThinking: "medium",
  noMemory: false,
  setInput: (input) => set({ input }),
  setAttachments: (attachments) => set({ attachments }),
  setLoadingConversation: (loadingConversation) => set({ loadingConversation }),
  setSelectedCwd: (selectedCwd) => set({ selectedCwd }),
  setSelectedThinking: (selectedThinking) => set({ selectedThinking }),
  setNoMemory: (noMemory) => set({ noMemory }),
  // Snapshot the visible conversation into the per-session cache without
  // clearing it. Used when switching sessions so the current thread stays on
  // screen until the target loads, instead of flashing the empty new-chat view.
  cacheActiveConversation: () => set((state) => cacheRealtime(state, visibleRealtime(state))),
  detachActiveConversation: () =>
    set((state) => ({
      ...blankRealtime(),
      ...cacheRealtime(state, visibleRealtime(state)),
    })),
  forgetConversation: (sessionId) =>
    set((state) => {
      const { [sessionId]: _forgottenRealtime, ...realtimeBySessionId } = state.realtimeBySessionId;
      const { [sessionId]: sessionPath, ...sessionPathById } = state.sessionPathById;
      return {
        ...(state.active?.sessionId === sessionId ? blankRealtime() : {}),
        realtimeBySessionId,
        sessionPathById,
        runningSessionPaths: sessionPath
          ? state.runningSessionPaths.filter((path) => path !== sessionPath)
          : state.runningSessionPaths,
      };
    }),
  getCachedSessionIdByPath: (sessionPath) => {
    const { sessionPathById } = get();
    return Object.entries(sessionPathById).find(([, path]) => path === sessionPath)?.[0];
  },
  restoreCachedConversation: ({ active, busy }) => {
    const sessionId = active.sessionId;
    if (!sessionId) return false;
    const cached = get().realtimeBySessionId[sessionId];
    if (!cached) return false;

    const next: ChatRealtimeState = {
      ...cached,
      active: { ...(cached.active ?? active), ...active },
      busy,
    };
    set((state) => ({
      ...next,
      ...cacheRealtime(state, next),
    }));
    return true;
  },
  resetConversation: (patch = {}) =>
    set((state) => ({
      ...blankRealtime(),
      realtimeBySessionId: state.realtimeBySessionId,
      sessionPathById: state.sessionPathById,
      runningSessionPaths: state.runningSessionPaths,
      input: "",
      loadingConversation: false,
      ...patch,
    })),
  applyEvent: (event) => {
    const state = get();
    const eventSessionId = event.sessionId;
    const activeRealtime = visibleRealtime(state);
    if (!eventSessionId) {
      const result = reduceAgentEvent(activeRealtime, event);
      set(result.state);
      return result.effects;
    }
    const activeMatch = eventSessionId === activeRealtime.active?.sessionId;
    const target = activeMatch ? activeRealtime : state.realtimeBySessionId[eventSessionId];
    if (!target) return [];

    const result = reduceAgentEvent(target, event);
    const cached = cacheRealtime(state, result.state);
    set(activeMatch ? { ...result.state, ...cached } : cached);
    return activeMatch
      ? result.effects
      : result.effects.filter((effect) => effect.type === "refreshSessions");
  },
}));

export function seedConversation(input: {
  active: ActiveConversation;
  messages: AppMessage[];
  liveTools?: LiveTool[];
  busy: boolean;
}) {
  // Derive from realtimeInitial so new realtime fields reset here automatically
  // instead of silently surviving across conversations.
  const realtime: ChatRealtimeState = {
    ...blankRealtime(),
    active: input.active,
    messages: input.messages,
    liveTools: input.liveTools ?? [],
    busy: input.busy,
  };
  useChatStore.setState((state) => ({
    ...realtime,
    ...cacheRealtime(state, realtime),
  }));
}

export function updateActiveExtensionUi(snapshot: ChatRealtimeState["extensionUi"]) {
  useChatStore.setState((state) => {
    if (!state.active?.sessionId) return {};
    const next = { ...visibleRealtime(state), extensionUi: snapshot };
    return {
      extensionUi: snapshot,
      ...cacheRealtime(state, next),
    };
  });
}

export function updateActiveExtensionCommands(commands: ChatRealtimeState["extensionCommands"]) {
  useChatStore.setState((state) => {
    if (!state.active?.sessionId) return {};
    const next = { ...visibleRealtime(state), extensionCommands: commands };
    return {
      extensionCommands: commands,
      ...cacheRealtime(state, next),
    };
  });
}

export function updateConversationTitle(sessionId: string, title: string) {
  useChatStore.setState((state) => {
    const activeMatch = state.active?.sessionId === sessionId;
    const target = activeMatch ? visibleRealtime(state) : state.realtimeBySessionId[sessionId];
    if (!target?.active) return {};

    const next: ChatRealtimeState = {
      ...target,
      active: { ...target.active, title },
      titlePending: false,
      titleRevealKey: target.titleRevealKey + 1,
    };
    const cached = cacheRealtime(state, next);
    return activeMatch ? { ...next, ...cached } : cached;
  });
}
