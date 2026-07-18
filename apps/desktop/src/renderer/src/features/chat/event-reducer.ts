import type { AppAgentEvent, ExtensionUiSnapshot } from "@yui/contracts";
import i18n from "@renderer/i18n";
import { formatTokenCount } from "@renderer/lib/format";
import { upsertMessage } from "./lib";
import type { ChatRealtimeState } from "./types";

// One-shot side effects the store cannot apply itself: catalog refreshes,
// user-facing notices (which live in the ui store, not in chat state, so a
// dismissed notice never resurfaces on a later unrelated event), and extension
// requests to write the composer draft (which must respect the user's draft).
export type ChatEventEffect =
  | { type: "refreshSessions" }
  | { type: "notice"; message: string }
  | { type: "setEditorText"; text: string };

export interface ChatEventResult {
  state: ChatRealtimeState;
  effects: ChatEventEffect[];
}

function unchanged(state: ChatRealtimeState): ChatEventResult {
  return { state, effects: [] };
}

function withExtensionUi(
  state: ChatRealtimeState,
  patch: Partial<ExtensionUiSnapshot>,
): ChatEventResult {
  return { state: { ...state, extensionUi: { ...state.extensionUi, ...patch } }, effects: [] };
}

/**
 * Key-overwrite semantics matching the runtime bridge: an existing key is
 * replaced in place (insertion order is preserved), `undefined` removes it.
 */
function upsertByKey<T extends { key: string }>(items: T[], key: string, next: T | undefined): T[] {
  const index = items.findIndex((item) => item.key === key);
  if (next === undefined) return index === -1 ? items : items.filter((item) => item.key !== key);
  if (index === -1) return [...items, next];
  return items.map((item, i) => (i === index ? next : item));
}

export function reduceAgentEvent(
  state: ChatRealtimeState,
  event: AppAgentEvent,
  now: number = Date.now(),
): ChatEventResult {
  if (event.sessionId && event.sessionId !== state.active?.sessionId) return unchanged(state);

  switch (event.type) {
    case "agent_start":
      return {
        state: {
          ...state,
          busy: true,
          activity: null,
          runTiming: { runStartedAt: state.runTiming.runStartedAt ?? now },
        },
        effects: [],
      };
    case "turn_start":
      return {
        state: { ...state, busy: true, activity: null },
        effects: [],
      };
    case "turn_end":
      // `message_*` events are the canonical render stream. A user request can
      // contain several Pi turns separated by tool calls, so duration settles at
      // agent_end instead of on each internal turn_end.
      return unchanged(state);
    case "agent_end": {
      if (event.willRetry) {
        return {
          state: { ...state, busy: true, liveTools: [], activity: null },
          effects: [],
        };
      }
      const { runStartedAt } = state.runTiming;
      const lastAssistant = state.messages.findLast((message) => message.role === "assistant");
      // A run that failed (bad API key, rate limit, network, …) ends in an
      // assistant message with stopReason "error". Mirror its errorMessage into a
      // one-shot notice so the failure is noticed even when the thread is scrolled
      // away; the message itself still renders the error inline (see finalReply).
      const runError =
        lastAssistant?.stopReason === "error" ? lastAssistant.errorMessage : undefined;
      return {
        state: {
          ...state,
          busy: false,
          liveTools: [],
          activity: null,
          runTiming: {},
          messageStats:
            runStartedAt === undefined || !lastAssistant
              ? state.messageStats
              : {
                  ...state.messageStats,
                  [lastAssistant.id]: {
                    ...state.messageStats[lastAssistant.id],
                    runMs: now - runStartedAt,
                  },
                },
        },
        effects: runError
          ? [{ type: "refreshSessions" }, { type: "notice", message: runError }]
          : [{ type: "refreshSessions" }],
      };
    }
    case "agent_settled":
      // The run is fully settled (final agent_end plus any retry/compaction
      // follow-up). agent_end already settles the busy state on the happy
      // path; this is the authoritative safety net for every other path
      // (abort, retry exhaustion) — it never carries payload, so there is
      // nothing to render beyond clearing indicators.
      return {
        state: { ...state, busy: false, liveTools: [], activity: null },
        effects: [],
      };
    case "message_start":
    case "message_update":
    case "message_end": {
      const pendingUserId =
        event.message.role === "user" && state.pendingUserId ? state.pendingUserId : null;
      const messages = pendingUserId
        ? state.messages.map((message) => (message.id === pendingUserId ? event.message : message))
        : upsertMessage(state.messages, event.message);

      return {
        state: {
          ...state,
          messages,
          pendingUserId: pendingUserId ? null : state.pendingUserId,
          liveTools:
            event.message.role === "toolResult" && event.message.toolCallId
              ? state.liveTools.filter((tool) => tool.toolCallId !== event.message.toolCallId)
              : state.liveTools,
        },
        effects: [],
      };
    }
    case "tool_execution_start":
      return {
        state: {
          ...state,
          liveTools: [
            ...state.liveTools.filter((tool) => tool.toolCallId !== event.toolCallId),
            {
              toolCallId: event.toolCallId,
              name: event.toolName,
              args: event.args,
              running: true,
            },
          ],
        },
        effects: [],
      };
    case "tool_execution_update":
      return {
        state: {
          ...state,
          liveTools: state.liveTools.map((tool) =>
            tool.toolCallId === event.toolCallId ? { ...tool, result: event.partialResult } : tool,
          ),
        },
        effects: [],
      };
    case "tool_execution_end":
      return {
        state: {
          ...state,
          liveTools: state.liveTools.map((tool) =>
            tool.toolCallId === event.toolCallId
              ? { ...tool, running: false, result: event.result, isError: event.isError }
              : tool,
          ),
        },
        effects: [],
      };
    case "queue_update":
      return {
        state: { ...state, queue: [...event.steering, ...event.followUp] },
        effects: [],
      };
    case "thinking_level_changed":
      return {
        state: {
          ...state,
          active: state.active ? { ...state.active, thinkingLevel: event.level } : null,
        },
        effects: [],
      };
    case "session_info_changed":
      return {
        state: {
          ...state,
          active:
            state.active && event.name ? { ...state.active, title: event.name } : state.active,
        },
        effects: [{ type: "refreshSessions" }],
      };
    case "compaction_start":
      return {
        state: { ...state, activity: { type: "compacting" } },
        effects: [],
      };
    case "compaction_end": {
      if (event.errorMessage) {
        return {
          state: { ...state, activity: null },
          effects: [{ type: "notice", message: event.errorMessage }],
        };
      }
      // A successful compaction is silent unless Pi reported the size win —
      // then surface it once so the context shrink is visible.
      const effects: ChatEventEffect[] =
        event.tokensBefore !== undefined && event.estimatedTokensAfter !== undefined
          ? [
              {
                type: "notice",
                message: i18n.t("chat.notices.compacted", {
                  before: formatTokenCount(event.tokensBefore),
                  after: formatTokenCount(event.estimatedTokensAfter),
                }),
              },
            ]
          : [];
      return { state: { ...state, activity: null }, effects };
    }
    case "auto_retry_start":
      return {
        state: {
          ...state,
          busy: true,
          activity: {
            type: "retrying",
            attempt: event.attempt,
            maxAttempts: event.maxAttempts,
          },
        },
        effects: [],
      };
    case "auto_retry_end":
      return {
        state: { ...state, activity: null },
        effects: event.finalError ? [{ type: "notice", message: event.finalError }] : [],
      };
    case "error":
      // Extension runtime errors are non-fatal notices: the run continues, so
      // busy must not flip here (fatal terminations always emit agent_end,
      // which owns the busy lifecycle).
      return { state, effects: [{ type: "notice", message: event.message }] };
    case "extension_ui_request":
      // Dedupe by requestId: the snapshot seeded on open may already contain a
      // request whose event also arrives through the live subscription.
      if (
        state.extensionUi.pendingRequests.some(
          (request) => request.requestId === event.request.requestId,
        )
      ) {
        return unchanged(state);
      }
      return withExtensionUi(state, {
        pendingRequests: [...state.extensionUi.pendingRequests, event.request],
      });
    case "extension_ui_dismiss":
      return withExtensionUi(state, {
        pendingRequests: state.extensionUi.pendingRequests.filter(
          (request) => request.requestId !== event.requestId,
        ),
      });
    case "extension_notice":
      return { state, effects: [{ type: "notice", message: event.message }] };
    case "extension_status_changed":
      return withExtensionUi(state, {
        statuses: upsertByKey(
          state.extensionUi.statuses,
          event.key,
          event.text === undefined ? undefined : { key: event.key, text: event.text },
        ),
      });
    case "extension_widget_changed":
      return withExtensionUi(state, {
        widgets: upsertByKey(
          state.extensionUi.widgets,
          event.key,
          event.lines === undefined
            ? undefined
            : { key: event.key, lines: event.lines, placement: event.placement },
        ),
      });
    case "extension_title_changed":
      return withExtensionUi(state, { title: event.title });
    case "extension_working_message_changed":
      return withExtensionUi(state, { workingMessage: event.message });
    case "extension_editor_set_text":
      return { state, effects: [{ type: "setEditorText", text: event.text }] };
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}
