// Maps Pi `AgentSessionEvent`s into Yui-owned `AppAgentEvent`s.
//
// This is the single seam where Pi event types are converted to Yui contract
// types; nothing outside this module should depend on Pi's event shapes. The
// mapper is stateful *per session* because Pi messages carry no stable id, so
// it assigns a synthetic id at `message_start` and threads it through the
// matching `message_update` / `message_end` events.

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { AssistantMessageEvent } from "@earendil-works/pi-ai";
import type { AppAgentEvent, AppMessage, AppStreamEvent } from "@yui/contracts";
import { mapAgentMessage } from "./message-mapper.ts";

export interface EventMapperOptions {
  sessionId: string;
  /**
   * Synthetic message-id generator. The default per-mapper counter embeds the
   * session id, so ids are unique across sessions; inject one in tests for
   * deterministic ids.
   */
  generateId?: () => string;
  /**
   * Optional sink for Pi events the mapper does not model. Lets callers log /
   * meter unknown events without the mapper crashing. Defaults to a no-op.
   */
  onUnmapped?: (type: string, event: unknown) => void;
}

export class AgentEventMapper {
  private readonly sessionId: string;
  private readonly generateId: () => string;
  private readonly onUnmapped: (type: string, event: unknown) => void;

  /** Synthetic id of the message currently streaming, set at `message_start`. */
  private currentMessageId: string | undefined;
  private counter = 0;

  constructor(options: EventMapperOptions) {
    this.sessionId = options.sessionId;
    this.onUnmapped = options.onUnmapped ?? (() => {});
    this.generateId = options.generateId ?? (() => `msg_${this.sessionId}_${++this.counter}`);
  }

  /**
   * Map one Pi event to zero or more Yui events. Returns an array because some
   * Pi events carry no renderable information (dropped -> `[]`) and so the
   * contract can later fan one Pi event into several Yui events.
   */
  map(event: AgentSessionEvent): AppAgentEvent[] {
    const sessionId = this.sessionId;

    switch (event.type) {
      // --- Run lifecycle ---------------------------------------------------
      case "agent_start":
        return [{ type: "agent_start", sessionId }];
      case "turn_start":
        return [{ type: "turn_start", sessionId }];
      case "turn_end":
        return [
          {
            type: "turn_end",
            sessionId,
            message: this.toAppMessage(event.message),
            toolResults: event.toolResults.map((m) => this.toAppMessage(m)),
          },
        ];
      case "agent_end":
        return [{ type: "agent_end", sessionId, willRetry: event.willRetry }];

      // --- Message lifecycle ----------------------------------------------
      case "message_start": {
        this.currentMessageId = this.generateId();
        return [
          {
            type: "message_start",
            sessionId,
            message: this.toAppMessage(event.message, this.currentMessageId),
          },
        ];
      }
      case "message_update": {
        // Only the nine content-level AssistantMessageEvents reach here; if a
        // future Pi version routes something else through message_update we
        // drop it rather than emit a malformed stream event.
        const stream = this.toAppStreamEvent(event.assistantMessageEvent);
        if (!stream) {
          this.onUnmapped(`message_update:${event.assistantMessageEvent.type}`, event);
          return [];
        }
        const id = this.currentMessageId ?? (this.currentMessageId = this.generateId());
        return [
          {
            type: "message_update",
            sessionId,
            message: this.toAppMessage(event.message, id),
            stream,
          },
        ];
      }
      case "message_end": {
        const id = this.currentMessageId ?? this.generateId();
        const mapped: AppAgentEvent = {
          type: "message_end",
          sessionId,
          message: this.toAppMessage(event.message, id),
        };
        this.currentMessageId = undefined;
        return [mapped];
      }

      // --- Tool execution --------------------------------------------------
      case "tool_execution_start":
        return [
          {
            type: "tool_execution_start",
            sessionId,
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            args: event.args,
          },
        ];
      case "tool_execution_update":
        return [
          {
            type: "tool_execution_update",
            sessionId,
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            partialResult: event.partialResult,
          },
        ];
      case "tool_execution_end":
        return [
          {
            type: "tool_execution_end",
            sessionId,
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            result: event.result,
            isError: event.isError,
          },
        ];

      // --- Session-level status -------------------------------------------
      case "queue_update":
        return [
          {
            type: "queue_update",
            sessionId,
            steering: [...event.steering],
            followUp: [...event.followUp],
          },
        ];
      case "compaction_start":
        return [{ type: "compaction_start", sessionId, reason: event.reason }];
      case "compaction_end":
        return [
          {
            type: "compaction_end",
            sessionId,
            reason: event.reason,
            aborted: event.aborted,
            willRetry: event.willRetry,
            errorMessage: event.errorMessage,
          },
        ];
      case "session_info_changed":
        return [{ type: "session_info_changed", sessionId, name: event.name }];
      case "thinking_level_changed":
        return [{ type: "thinking_level_changed", sessionId, level: event.level }];
      case "auto_retry_start":
        return [
          {
            type: "auto_retry_start",
            sessionId,
            attempt: event.attempt,
            maxAttempts: event.maxAttempts,
            delayMs: event.delayMs,
            errorMessage: event.errorMessage,
          },
        ];
      case "auto_retry_end":
        return [
          {
            type: "auto_retry_end",
            sessionId,
            success: event.success,
            attempt: event.attempt,
            finalError: event.finalError,
          },
        ];

      default:
        return this.dropUnknown(event);
    }
  }

  /**
   * Forward-compatibility guard. `event` is `never` while the switch is
   * exhaustive over the Pi event union we model, so adding/handling a new Pi
   * event becomes a compile error here until it is mapped. At runtime, unknown
   * events are reported and dropped instead of crashing the session.
   */
  private dropUnknown(event: never): AppAgentEvent[] {
    const type = (event as { type?: string }).type ?? "unknown";
    this.onUnmapped(type, event);
    return [];
  }

  // --- Message + content conversion --------------------------------------

  /** Delegate to the shared message mapper, supplying a synthetic id. */
  private toAppMessage(message: AgentMessage, id?: string): AppMessage {
    return mapAgentMessage(message, id ?? this.generateId(), this.onUnmapped);
  }

  // --- Stream (nested AssistantMessageEvent) conversion ------------------

  /**
   * Returns `undefined` for the `start` / `done` / `error` variants, which Pi
   * never routes through `message_update` (they become message_start /
   * message_end). Callers treat `undefined` as "drop this event".
   */
  private toAppStreamEvent(e: AssistantMessageEvent): AppStreamEvent | undefined {
    switch (e.type) {
      case "text_start":
        return { kind: "text_start", contentIndex: e.contentIndex };
      case "text_delta":
        return { kind: "text_delta", contentIndex: e.contentIndex, delta: e.delta };
      case "text_end":
        return { kind: "text_end", contentIndex: e.contentIndex, content: e.content };
      case "thinking_start":
        return { kind: "thinking_start", contentIndex: e.contentIndex };
      case "thinking_delta":
        return { kind: "thinking_delta", contentIndex: e.contentIndex, delta: e.delta };
      case "thinking_end":
        return { kind: "thinking_end", contentIndex: e.contentIndex, content: e.content };
      case "toolcall_start":
        return { kind: "toolcall_start", contentIndex: e.contentIndex };
      case "toolcall_delta":
        return { kind: "toolcall_delta", contentIndex: e.contentIndex, delta: e.delta };
      case "toolcall_end":
        return { kind: "toolcall_end", contentIndex: e.contentIndex, toolCallId: e.toolCall.id };
      default:
        return undefined;
    }
  }
}
