import type { AppAgentEvent, AppMessage } from "@yui/contracts";

const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

/**
 * Render a single agent event for human chat output. Pure: writes through the
 * provided sink so it can be unit-tested. Streaming text comes from the inner
 * `message_update` stream; tools and errors are rendered as status lines.
 */
export function renderEvent(event: AppAgentEvent, write: (chunk: string) => void): void {
  switch (event.type) {
    case "message_update":
      if (event.stream.kind === "text_delta") write(event.stream.delta);
      else if (event.stream.kind === "thinking_delta") write(`${DIM}${event.stream.delta}${RESET}`);
      break;

    case "message_end":
      if (event.message.role === "assistant") write("\n");
      break;

    case "tool_execution_start":
      write(`\n${CYAN}⚙ ${event.toolName}${RESET} ${truncate(safeJson(event.args))}\n`);
      break;

    case "tool_execution_end":
      write(
        event.isError
          ? `${RED}✗ ${event.toolName} failed${RESET}\n`
          : `${GREEN}✓ ${event.toolName}${RESET}\n`,
      );
      break;

    case "auto_retry_start":
      write(`${DIM}↻ retry ${event.attempt}/${event.maxAttempts} in ${event.delayMs}ms${RESET}\n`);
      break;

    case "error":
      write(`\n${RED}! ${event.message}${RESET}\n`);
      break;

    default:
      // Other lifecycle/session events carry no inline text to render.
      break;
  }
}

/**
 * Render a stored conversation (from the session catalog) for `session show`
 * and the `chat --resume` preamble. Mirrors the live event renderer's styling
 * but works on settled `AppMessage` snapshots rather than a stream.
 */
export function renderHistory(messages: AppMessage[], write: (chunk: string) => void): void {
  for (const message of messages) {
    renderMessage(message, write);
  }
}

function renderMessage(message: AppMessage, write: (chunk: string) => void): void {
  switch (message.role) {
    case "user": {
      const text = textOf(message);
      if (text) write(`\n${BOLD}›${RESET} ${text}\n`);
      break;
    }
    case "assistant":
      for (const block of message.content) {
        if (block.type === "text") write(block.text);
        else if (block.type === "thinking") write(`${DIM}${block.thinking}${RESET}`);
        else if (block.type === "toolCall")
          write(`\n${CYAN}⚙ ${block.name}${RESET} ${truncate(safeJson(block.arguments))}`);
      }
      write("\n");
      break;
    case "toolResult": {
      const mark = message.isError ? `${RED}✗${RESET}` : `${GREEN}✓${RESET}`;
      write(`${mark} ${message.toolName ?? "tool"} ${DIM}${truncate(textOf(message))}${RESET}\n`);
      break;
    }
    case "compactionSummary": {
      const tokens = message.tokensBefore != null ? ` from ${message.tokensBefore} tokens` : "";
      write(`\n${CYAN}[compaction]${RESET}${DIM}${tokens}${RESET}\n`);
      const text = textOf(message);
      if (text) write(`${DIM}${text}${RESET}\n`);
      break;
    }
    case "branchSummary": {
      write(`\n${CYAN}[branch]${RESET}\n`);
      const text = textOf(message);
      if (text) write(`${DIM}${text}${RESET}\n`);
      break;
    }
    case "bashExecution": {
      write(`\n${CYAN}$ ${message.command ?? ""}${RESET}\n`);
      const output = textOf(message);
      if (output) write(`${DIM}${truncate(output, 2000)}${RESET}\n`);
      if (message.isError) {
        const status = message.exitCode != null ? `exit ${message.exitCode}` : "cancelled";
        write(`${RED}(${status})${RESET}\n`);
      }
      break;
    }
    case "custom": {
      // `display: false` customs arrive with empty content; skip them silently.
      const text = textOf(message);
      if (text) write(`\n${CYAN}[${message.customType ?? "custom"}]${RESET}\n${text}\n`);
      break;
    }
    default:
      // Unknown roles carry no inline text to render.
      break;
  }
}

function textOf(message: AppMessage): string {
  return message.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

function truncate(text: string, max = 120): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
