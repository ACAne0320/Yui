import type { AppMessage } from "@yui/contracts";
import { shortPath } from "@renderer/lib/format";

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
