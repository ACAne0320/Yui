// Per-task transcript for the built-in subagent tool: folds a child session's
// event stream into structured steps (tool calls with their outputs, assistant
// text blocks) plus the final report text.

import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";

/** Progress text kept per streamed update; older transcript lines roll off. */
const MAX_PROGRESS_CHARS = 2_000;
const ARG_SUMMARY_CHARS = 200;
/**
 * Caps for the structured steps shipped in details while RUNNING (the full
 * snapshot is re-sent on every throttled update, so keep it IPC-friendly).
 * The final result ships uncapped: completed cards and reloaded sessions
 * must show the complete transcript.
 */
const STEP_MAX_ITEMS = 30;
const STEP_TEXT_CHARS = 4_000;
/** Running-snapshot cap for nested tool results (full in the final snapshot). */
const STEP_RESULT_CHARS = 700;

/** One transcript step: a tool invocation line or an assistant text block. */
export interface TranscriptItem {
  kind: "tool" | "text";
  text: string;
  /** Tool steps: the call's output once it finishes. */
  result?: string;
  isError?: boolean;
}

/** One-line argument preview for transcript lines like `→ bash {"command":…}`. */
export function summarizeArgs(args: unknown): string {
  if (args == null) return "";
  const json = typeof args === "string" ? args : JSON.stringify(args);
  if (!json || json === "{}") return "";
  return json.length > ARG_SUMMARY_CHARS ? `${json.slice(0, ARG_SUMMARY_CHARS - 1)}…` : json;
}

function textBlocks(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (block): block is { type: "text"; text: string } =>
        typeof block === "object" &&
        block !== null &&
        (block as { type?: unknown }).type === "text" &&
        typeof (block as { text?: unknown }).text === "string",
    )
    .map((block) => block.text)
    .join("\n\n")
    .trim();
}

function extractAssistantText(message: { role: string; content?: unknown }): string {
  if (message.role !== "assistant") return "";
  return textBlocks(message.content);
}

/**
 * Folds child-session events into a progress transcript plus the final report.
 * Pi's ordering — an assistant message ends before its tool calls execute —
 * means `message_end` text and `tool_execution_start` lines interleave in
 * conversation order, and the last assistant text standing is the report.
 */
export class SubagentTranscript {
  private readonly items: TranscriptItem[] = [];
  /** Open tool steps awaiting their result, keyed by toolCallId. */
  private readonly openToolSteps = new Map<string, TranscriptItem>();
  private streamingText = "";
  toolUseCount = 0;
  finalText = "";

  /** Returns true when the event changed something worth re-rendering. */
  apply(event: AgentSessionEvent): boolean {
    switch (event.type) {
      case "message_update": {
        const stream = event.assistantMessageEvent;
        if (stream.type === "text_delta") {
          this.streamingText += stream.delta;
          return true;
        }
        if (stream.type === "text_end") {
          this.streamingText = stream.content;
          return true;
        }
        return false;
      }
      case "message_end": {
        this.streamingText = "";
        const text = extractAssistantText(event.message);
        if (!text) return false;
        this.items.push({ kind: "text", text });
        this.finalText = text;
        return true;
      }
      case "tool_execution_start": {
        this.toolUseCount += 1;
        const item: TranscriptItem = {
          kind: "tool",
          text: `${event.toolName} ${summarizeArgs(event.args)}`.trimEnd(),
        };
        this.items.push(item);
        this.openToolSteps.set(event.toolCallId, item);
        return true;
      }
      case "tool_execution_end": {
        const item = this.openToolSteps.get(event.toolCallId);
        if (!item) return false;
        this.openToolSteps.delete(event.toolCallId);
        const output = textBlocks((event.result as { content?: unknown })?.content);
        if (output) item.result = output;
        if (event.isError) item.isError = true;
        return true;
      }
      default:
        return false;
    }
  }

  /**
   * Steps for structured rendering, shipped in tool details. The running
   * snapshot is re-sent on every throttled update, so it is tail-capped to
   * stay IPC-friendly; the final snapshot is complete (completed cards and
   * reloaded sessions show the full transcript). The streaming text appears
   * as a trailing (mutating) text step.
   */
  steps(final = false): TranscriptItem[] {
    const all = this.streamingText
      ? [...this.items, { kind: "text" as const, text: this.streamingText }]
      : [...this.items];
    if (final) return all;
    return all.slice(-STEP_MAX_ITEMS).map((item) => {
      if (item.kind === "text" && item.text.length > STEP_TEXT_CHARS) {
        return { kind: item.kind, text: `…${item.text.slice(-STEP_TEXT_CHARS)}` };
      }
      if (item.kind === "tool" && item.result && item.result.length > STEP_RESULT_CHARS) {
        return { ...item, result: `${item.result.slice(0, STEP_RESULT_CHARS)}…` };
      }
      return item;
    });
  }

  /** Plain-text progress (CLI and non-structured fallbacks). */
  renderProgress(): string {
    const parts = this.items.map((item) => (item.kind === "tool" ? `→ ${item.text}` : item.text));
    if (this.streamingText) parts.push(this.streamingText);
    const text = parts.join("\n");
    return text.length > MAX_PROGRESS_CHARS ? `…${text.slice(-MAX_PROGRESS_CHARS)}` : text;
  }
}
