import type { AppContentBlock, AppMessage } from "@yui/contracts";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@renderer/ui/Icon";
import { Markdown } from "@renderer/ui/Markdown";
import { formatDuration, textFromMessage } from "../lib";
import type { LiveTool } from "../types";
import { Message } from "./Message";
import { ToolCard } from "./ToolCard";

type ToolCallBlock = Extract<AppContentBlock, { type: "toolCall" }>;

type ExecutionItem =
  | { type: "reasoning"; id: string; text: string }
  | { type: "assistant"; id: string; text: string; live: boolean }
  | {
      type: "tool";
      id: string;
      name: string;
      args?: unknown;
      detail: unknown;
      running: boolean;
      error?: boolean;
    }
  | { type: "message"; id: string; message: AppMessage };

function toolResultDetail(message: AppMessage | undefined): unknown {
  if (!message) return undefined;
  const text = textFromMessage(message);
  return message.toolDetails === undefined
    ? text
    : { content: [{ type: "text", text }], details: message.toolDetails };
}

function buildExecutionItems(
  messages: AppMessage[],
  finalAssistantId: string | undefined,
  streamingAssistantId: string | undefined,
  liveTools: LiveTool[],
  running: boolean,
): ExecutionItem[] {
  const results = new Map(
    messages
      .filter((message) => message.role === "toolResult" && message.toolCallId)
      .map((message) => [message.toolCallId!, message]),
  );
  const live = new Map(liveTools.map((tool) => [tool.toolCallId, tool]));
  const consumedResults = new Set<string>();
  const items: ExecutionItem[] = [];

  for (const message of messages) {
    if (message.role === "assistant") {
      const reasoning = message.content
        .filter((block) => block.type === "thinking")
        .map((block) => block.thinking)
        .join("\n");
      if (reasoning)
        items.push({ type: "reasoning", id: `${message.id}:reasoning`, text: reasoning });

      const text = textFromMessage(message);
      if (text && message.id !== finalAssistantId) {
        items.push({
          type: "assistant",
          id: `${message.id}:text`,
          text,
          live: message.id === streamingAssistantId,
        });
      }

      for (const block of message.content.filter(
        (content): content is ToolCallBlock => content.type === "toolCall",
      )) {
        const result = results.get(block.id);
        const active = live.get(block.id);
        if (result) consumedResults.add(result.id);
        items.push({
          type: "tool",
          id: block.id,
          name: block.name,
          args: active?.args ?? block.arguments,
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
      items.push({
        type: "tool",
        id: message.toolCallId ?? message.id,
        name: message.toolName ?? "tool",
        args: active?.args,
        detail: active?.result ?? toolResultDetail(message),
        running: active?.running ?? false,
        error: active?.isError ?? message.isError,
      });
      continue;
    }

    items.push({ type: "message", id: message.id, message });
  }

  for (const tool of liveTools) {
    if (items.some((item) => item.type === "tool" && item.id === tool.toolCallId)) continue;
    items.push({
      type: "tool",
      id: tool.toolCallId,
      name: tool.name,
      args: tool.args,
      detail: tool.result,
      running: tool.running,
      error: tool.isError,
    });
  }
  return items;
}

function ExecutionLabel({
  running,
  startedAt,
  durationMs,
}: {
  running: boolean;
  startedAt?: number;
  durationMs?: number;
}) {
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (!running || startedAt === undefined) return;
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [running, startedAt]);

  if (running) {
    return startedAt === undefined
      ? t("chat.execution.running")
      : t("chat.execution.runningIn", {
          duration: formatDuration(Math.max(0, now - startedAt), t),
        });
  }
  return durationMs === undefined
    ? t("chat.execution.completed")
    : t("chat.execution.completedIn", { duration: formatDuration(durationMs, t) });
}

export function ExecutionChain({
  messages,
  finalAssistantId,
  streamingAssistantId,
  liveTools,
  running,
  startedAt,
  durationMs,
}: {
  messages: AppMessage[];
  finalAssistantId?: string;
  streamingAssistantId?: string;
  liveTools: LiveTool[];
  running: boolean;
  startedAt?: number;
  durationMs?: number;
}) {
  const { t } = useTranslation();
  // Expand the reasoning/tool stream while the model is still working, then
  // collapse back to the summary line the moment the final reply starts
  // streaming (its first text token defines `finalAssistantId`). Manual toggles
  // in between are preserved until the next work/answer transition.
  const working = running && finalAssistantId === undefined;
  const [open, setOpen] = useState(working);
  useEffect(() => {
    setOpen(working);
  }, [working]);
  const items = useMemo(
    () => buildExecutionItems(messages, finalAssistantId, streamingAssistantId, liveTools, running),
    [finalAssistantId, streamingAssistantId, liveTools, messages, running],
  );
  const expandable = items.length > 0;

  if (!running && durationMs === undefined && !expandable) return null;

  return (
    <section className="execution-chain" data-open={open} data-running={running}>
      <button onClick={() => expandable && setOpen((value) => !value)}>
        <span className="execution-status">
          {running ? <span className="spinner" /> : <Icon name="clock" size={14} />}
        </span>
        <ExecutionLabel running={running} startedAt={startedAt} durationMs={durationMs} />
        {expandable && <Icon name="chevron" size={13} />}
      </button>
      {expandable && (open || running) && (
        <div className="execution-reveal">
          <div className="execution-details">
            {items.map((item) => {
              if (item.type === "reasoning") {
                return (
                  <div className="execution-reasoning" key={item.id}>
                    <div>{item.text}</div>
                  </div>
                );
              }
              if (item.type === "assistant") {
                // The live-streaming trailing message has no label: it may still
                // become the final answer (then it lifts into the bubble) or a
                // preamble (then the label appears in place once its tool call
                // settles) — either way its text never changes position.
                return (
                  <div className="execution-intermediate" key={item.id}>
                    {!item.live && <strong>{t("chat.execution.intermediateReply")}</strong>}
                    <Markdown>{item.text}</Markdown>
                  </div>
                );
              }
              if (item.type === "tool") {
                return (
                  <ToolCard
                    key={item.id}
                    name={item.name}
                    args={item.args}
                    detail={item.detail}
                    running={item.running}
                    error={item.error}
                  />
                );
              }
              return (
                <Message
                  key={item.id}
                  message={item.message}
                  streaming={false}
                  showAssistantMeta={false}
                />
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
