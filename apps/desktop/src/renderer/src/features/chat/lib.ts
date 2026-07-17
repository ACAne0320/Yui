import type { AppContentBlock, AppMessage } from "@yui/contracts";
import { shortPath } from "@renderer/lib/format";
import type { LiveTool } from "./types";

export type TimeGroup = "today" | "thisWeek" | "older";

// Sentinel workspace-group key: all scratch (temporary) workspaces collapse into
// this single bucket instead of each scratch path forming its own group, matching
// how the composer shows them as one "temporary directory" entry.
export const TEMP_GROUP_KEY = "__temp__";

export function timeGroup(timestamp: number): TimeGroup {
  const now = new Date();
  const value = new Date(timestamp);
  if (value.toDateString() === now.toDateString()) return "today";
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 7);
  return value >= weekAgo ? "thisWeek" : "older";
}

export function sessionGroup(
  cwd: string,
  mode: "time" | "workspace",
  timestamp: number,
  isScratch?: (path: string) => boolean,
): string {
  if (mode === "time") return timeGroup(timestamp);
  return isScratch?.(cwd) ? TEMP_GROUP_KEY : shortPath(cwd);
}

export function upsertMessage(messages: AppMessage[], message: AppMessage): AppMessage[] {
  const index = messages.findIndex((item) => item.id === message.id);
  if (index === -1) return [...messages, message];
  const next = messages.slice();
  next[index] = message;
  return next;
}

export interface ConversationTurn {
  user: AppMessage;
  messages: AppMessage[];
}

/** Group the flat Pi transcript into user-facing request/response turns. */
export function conversationTurns(messages: AppMessage[]): {
  leading: AppMessage[];
  turns: ConversationTurn[];
} {
  const leading: AppMessage[] = [];
  const turns: ConversationTurn[] = [];
  let current: ConversationTurn | undefined;

  for (const message of messages) {
    if (message.role === "user") {
      current = { user: message, messages: [] };
      turns.push(current);
    } else if (current) {
      current.messages.push(message);
    } else {
      leading.push(message);
    }
  }
  return { leading, turns };
}

export function finalReply(messages: AppMessage[], requireSettled = false): AppMessage | undefined {
  return messages.findLast(
    (message) =>
      message.role === "assistant" &&
      message.stopReason !== "toolUse" &&
      !message.content.some((block) => block.type === "toolCall") &&
      // A failed run ends in an assistant message with stopReason "error" and an
      // errorMessage but (usually) no text content; promote it too so the error
      // surfaces in the thread instead of the run ending silently.
      (textFromMessage(message).trim() !== "" || message.stopReason === "error") &&
      // While a run is live, a still-streaming message has no stopReason and no
      // toolCall block yet, so it would transiently match — then drop out the
      // instant a tool call streams in (the bubble→chain flicker). Requiring a
      // settled stopReason keeps that pre-tool-call text in the execution chain.
      (!requireSettled || message.stopReason !== undefined),
  );
}

/** Prefer exact live timing; fall back to persisted user-start → reply-write time. */
export function runDurationMs(
  user: AppMessage,
  reply: AppMessage | undefined,
  liveMs?: number,
): number | undefined {
  if (liveMs !== undefined) return liveMs;
  if (reply?.completedAt === undefined) return undefined;
  return Math.max(0, reply.completedAt - user.timestamp);
}

/**
 * Human-friendly duration via the i18n duration keys, rounded down to elapsed
 * whole seconds. Longer durations use minutes + seconds, adding hours when needed.
 */
export function formatDuration(
  ms: number,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const wholeSeconds = Math.floor(ms / 1000);
  if (wholeSeconds < 60) return t("chat.duration.seconds", { value: wholeSeconds });
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainingSeconds = wholeSeconds % 60;
  return hours > 0
    ? t("chat.duration.hours", { hours, minutes, seconds: remainingSeconds })
    : t("chat.duration.minutes", { minutes, seconds: remainingSeconds });
}

export function textFromMessage(message: AppMessage): string {
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

type ToolCallBlock = Extract<AppContentBlock, { type: "toolCall" }>;

/** A single tool invocation inside a turn, standalone or inside a tool group. */
export interface ToolSegment {
  kind: "tool";
  id: string;
  name: string;
  args?: unknown;
  detail: unknown;
  running: boolean;
  error?: boolean;
}

/**
 * One ordered step inside a turn's process disclosure. Intermediate prose,
 * reasoning, and tool calls render in the order they occurred; the final reply's
 * text is excluded by `finalAssistantId` (it is lifted into the always-visible
 * answer bubble instead). Consecutive plain tool calls are folded into a
 * `toolGroup` by `groupToolSegments`.
 */
export type TurnSegment =
  | { kind: "prose"; id: string; text: string; live: boolean }
  | { kind: "reasoning"; id: string; text: string }
  | ToolSegment
  | { kind: "toolGroup"; id: string; tools: ToolSegment[] }
  | { kind: "message"; id: string; message: AppMessage };

function toolResultDetail(message: AppMessage | undefined): unknown {
  if (!message) return undefined;
  const text = textFromMessage(message);
  return message.toolDetails === undefined
    ? text
    : { content: [{ type: "text", text }], details: message.toolDetails };
}

export function buildTurnSegments(
  messages: AppMessage[],
  liveTools: LiveTool[],
  running: boolean,
  finalAssistantId: string | undefined,
): TurnSegment[] {
  const results = new Map(
    messages
      .filter((message) => message.role === "toolResult" && message.toolCallId)
      .map((message) => [message.toolCallId!, message]),
  );
  const live = new Map(liveTools.map((tool) => [tool.toolCallId, tool]));
  const consumedResults = new Set<string>();
  const lastId = messages.at(-1)?.id;
  const segments: TurnSegment[] = [];

  for (const message of messages) {
    if (message.role === "assistant") {
      const reasoning = message.content
        .filter((block) => block.type === "thinking")
        .map((block) => block.thinking)
        .join("\n");
      if (reasoning)
        segments.push({ kind: "reasoning", id: `${message.id}:reasoning`, text: reasoning });

      // The final reply's text is excluded — it renders as the always-on answer
      // bubble. Everything before it, and the still-streaming trailing text
      // (which is not yet promoted to final), belongs in the disclosure.
      const text = textFromMessage(message);
      if (text && message.id !== finalAssistantId) {
        const streaming =
          running &&
          message.id === lastId &&
          message.stopReason === undefined &&
          !message.content.some((block) => block.type === "toolCall");
        segments.push({ kind: "prose", id: `${message.id}:text`, text, live: streaming });
      }

      for (const block of message.content.filter(
        (content): content is ToolCallBlock => content.type === "toolCall",
      )) {
        const result = results.get(block.id);
        const active = live.get(block.id);
        if (result) consumedResults.add(result.id);
        // The model emits a tool call's arguments as a JSON delta stream, so
        // `block.arguments` is rebuilt on every token and the card's command
        // would type itself out (e.g. a path filling in char by char). Only show
        // a complete invocation. `stopReason` is NOT a reliable "done" signal —
        // some providers set it while still streaming (see ConversationTurn) — so
        // gate on signals that only exist once the arguments are whole: the tool
        // has started executing (`active`, fed the full args at execution start),
        // a result landed, or the run is no longer live (persisted history).
        // While the call is still streaming, leave args out so the command
        // appears at once instead of crawling in.
        const argsComplete = result !== undefined || !running;
        segments.push({
          kind: "tool",
          id: block.id,
          name: block.name,
          args: active?.args ?? (argsComplete ? block.arguments : undefined),
          detail: active?.result ?? toolResultDetail(result),
          running: active?.running ?? (running && !result),
          error: active?.isError ?? result?.isError,
        });
      }
      continue;
    }

    if (message.role === "toolResult") {
      if (consumedResults.has(message.id)) continue;
      const active = message.toolCallId ? live.get(message.toolCallId) : undefined;
      segments.push({
        kind: "tool",
        id: message.toolCallId ?? message.id,
        name: message.toolName ?? "tool",
        args: active?.args,
        detail: active?.result ?? toolResultDetail(message),
        running: active?.running ?? false,
        error: active?.isError ?? message.isError,
      });
      continue;
    }

    segments.push({ kind: "message", id: message.id, message });
  }

  for (const tool of liveTools) {
    if (segments.some((segment) => segment.kind === "tool" && segment.id === tool.toolCallId))
      continue;
    segments.push({
      kind: "tool",
      id: tool.toolCallId,
      name: tool.name,
      args: tool.args,
      detail: tool.result,
      running: tool.running,
      error: tool.isError,
    });
  }

  return segments;
}

/** Tools with dedicated rich rendering in ToolCard stay standalone and break a
    group — folding a subagent report or memory card into a quiet row would hide it. */
const UNGROUPABLE_TOOLS = new Set(["subagent", "remember"]);

/**
 * Fold runs of consecutive plain tool calls into one `toolGroup` segment, so a
 * busy tool loop reads as a single collapsible row (Codex-style) instead of a
 * wall of cards. Prose, reasoning, messages, and rich tools break a run; a lone
 * tool stays a plain `tool` segment (one click to its output, no double toggle).
 * The group id is the first tool's id, keeping the React key stable while
 * streaming appends more calls to the run.
 */
export function groupToolSegments(segments: TurnSegment[]): TurnSegment[] {
  const grouped: TurnSegment[] = [];
  let pending: ToolSegment[] = [];
  const flush = () => {
    const [first] = pending;
    if (pending.length >= 2 && first) {
      grouped.push({ kind: "toolGroup", id: first.id, tools: pending });
    } else {
      grouped.push(...pending);
    }
    pending = [];
  };

  for (const segment of segments) {
    if (segment.kind === "tool" && !UNGROUPABLE_TOOLS.has(segment.name)) {
      pending.push(segment);
      continue;
    }
    flush();
    grouped.push(segment);
  }
  flush();
  return grouped;
}
