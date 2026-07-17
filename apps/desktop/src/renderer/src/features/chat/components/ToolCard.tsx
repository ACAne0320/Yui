import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@renderer/ui/Icon";
import { Markdown } from "@renderer/ui/Markdown";
import { MemoryCard, rememberedFrom } from "./MemoryCard";
import { SubagentCards, subagentTasksFrom } from "./SubagentCards";

// Tool results shaped like Pi's AgentToolResult ({ content: [{ type: "text",
// text }] }) display as their text, not as JSON.
function toDisplayText(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (detail === undefined) return "";
  if (typeof detail === "object" && detail !== null && "content" in detail) {
    const content = (detail as { content: unknown }).content;
    if (Array.isArray(content)) {
      const texts = content
        .filter(
          (block): block is { type: "text"; text: string } =>
            typeof block === "object" &&
            block !== null &&
            (block as { type?: unknown }).type === "text" &&
            typeof (block as { text?: unknown }).text === "string",
        )
        .map((block) => block.text);
      if (texts.length > 0) return texts.join("\n");
    }
  }
  return JSON.stringify(detail, null, 2);
}

function oneLine(value: unknown, fromEnd: boolean): string {
  const text =
    typeof value === "string"
      ? value
      : value === undefined
        ? ""
        : toDisplayText(value) || JSON.stringify(value);
  if (!text) return "";
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  return (fromEnd ? lines.at(-1) : lines[0])?.trim() ?? "";
}

/**
 * What the tool was *invoked* with — the command or primary argument — so the
 * header reads `Bash ls -la` rather than echoing the result's first line. Picks
 * the most descriptive field for the common tools (bash `command`, grep/find
 * `pattern`, read/write/edit/ls `path`), then falls back to a lone string field.
 * Returns "" when nothing readable is found, letting the caller fall back to the
 * result preview (e.g. orphan tool results that carry no captured arguments).
 */
export function argSummary(args: unknown): string {
  if (typeof args === "string") return oneLine(args, false);
  if (typeof args !== "object" || args === null) return "";
  const record = args as Record<string, unknown>;
  const primary =
    record.command ??
    record.pattern ??
    record.query ??
    record.url ??
    record.path ??
    record.file_path ??
    record.filePath ??
    record.prompt;
  if (typeof primary === "string") return oneLine(primary, false);
  const strings = Object.values(record).filter((value) => typeof value === "string");
  return strings.length === 1 ? oneLine(strings[0], false) : "";
}

export function ToolCard({
  name,
  detail,
  args,
  running,
  error,
}: {
  name: string;
  detail: unknown;
  args?: unknown;
  running: boolean;
  error?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (name === "subagent") {
    const tasks = subagentTasksFrom(detail, args, running);
    if (tasks) return <SubagentCards tasks={tasks} />;
  }
  if (name === "remember") {
    const remembered = rememberedFrom(detail);
    if (remembered) return <MemoryCard entry={remembered.entry} updated={remembered.updated} />;
  }

  const text = toDisplayText(detail);
  // Prefer the invocation (command/args); fall back to the result preview —
  // its streaming tail while running, its first line once finished.
  const summary = argSummary(args) || oneLine(detail, running);
  const expandable = text !== "";
  return (
    <div className="tool-card" data-running={running} data-error={Boolean(error)} data-open={open}>
      <button
        onClick={() => expandable && setOpen((value) => !value)}
        title={running ? t("chat.tools.running") : error ? t("chat.tools.failed") : name}
      >
        <span className="tool-status">
          {running ? (
            <span className="spinner" />
          ) : (
            <Icon name={error ? "info" : "checkCircle"} size={15} />
          )}
        </span>
        <strong>{name}</strong>
        <code>{summary}</code>
        {expandable && <Icon name="chevron" size={13} />}
      </button>
      {open &&
        expandable &&
        (name === "subagent" ? (
          <div className="tool-card-markdown">
            <Markdown>{text}</Markdown>
          </div>
        ) : (
          <pre>{text}</pre>
        ))}
    </div>
  );
}
