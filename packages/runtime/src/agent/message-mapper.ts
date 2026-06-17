// Converts a single Pi `AgentMessage` into a Yui-owned `AppMessage`.
//
// This is the one place Pi message/content shapes are translated, shared by the
// live `AgentEventMapper` (streaming events) and the cold `SessionCatalog`
// (history read from JSONL). Pure given a caller-supplied id; all Pi imports are
// `import type`, so this module pulls in no Pi runtime code.

import type { AgentMessage } from "@earendil-works/pi-agent-core";
// Loads pi-coding-agent's declaration merging so AgentMessage includes the
// coding-agent roles (custom/compactionSummary/branchSummary/bashExecution)
// as properly typed union members rather than unknowns we'd have to cast.
import type {} from "@earendil-works/pi-coding-agent";
import type {
  AssistantMessage,
  ImageContent,
  TextContent,
  ThinkingContent,
  ToolCall,
  ToolResultMessage,
  Usage,
  UserMessage,
} from "@earendil-works/pi-ai";
import type { AppContentBlock, AppMessage, AppStopReason, AppUsage } from "@yui/contracts";

import { imageAttachmentId } from "./attachment-id.ts";

type LlmContent = TextContent | ThinkingContent | ToolCall | ImageContent;

// Narrow the (augmented) AgentMessage union by role, so Pi renaming a field is
// a compile error here instead of a silently-undefined mapping.
type CompactionSummaryMessage = Extract<AgentMessage, { role: "compactionSummary" }>;
type BranchSummaryMessage = Extract<AgentMessage, { role: "branchSummary" }>;
type BashExecutionMessage = Extract<AgentMessage, { role: "bashExecution" }>;
type CustomMessage = Extract<AgentMessage, { role: "custom" }>;

/** Optional sink for content blocks the mapper does not model. */
export type OnUnmapped = (type: string, value: unknown) => void;

/** Map a Pi message to an AppMessage, assigning it the given synthetic id. */
export function mapAgentMessage(
  message: AgentMessage,
  id: string,
  onUnmapped: OnUnmapped = () => {},
): AppMessage {
  switch (message.role) {
    case "assistant":
      return fromAssistant(message, id, onUnmapped);
    case "user":
      return fromUser(message, id, onUnmapped);
    case "toolResult":
      return fromToolResult(message, id, onUnmapped);
    case "compactionSummary":
      return fromCompactionSummary(message, id);
    case "branchSummary":
      return fromBranchSummary(message, id);
    case "bashExecution":
      return fromBashExecution(message, id);
    case "custom":
      return fromCustom(message, id, onUnmapped);
    default:
      // Genuinely unknown role: surface it but keep a non-blank, non-crashing
      // shape rather than silently dropping the message.
      onUnmapped(`message:${(message as { role?: string }).role ?? "unknown"}`, message);
      return fromUnknown(message, id);
  }
}

/** A single text block, or none when the text is empty/absent. */
function textBlocks(text: string | undefined): AppContentBlock[] {
  return text ? [{ type: "text", text }] : [];
}

function fromAssistant(m: AssistantMessage, id: string, onUnmapped: OnUnmapped): AppMessage {
  return {
    id,
    role: "assistant",
    content: m.content.map((c) => fromContent(c, onUnmapped)),
    providerId: m.provider,
    model: m.model,
    stopReason: m.stopReason as AppStopReason,
    usage: fromUsage(m.usage),
    errorMessage: m.errorMessage,
    timestamp: m.timestamp,
  };
}

function fromUser(m: UserMessage, id: string, onUnmapped: OnUnmapped): AppMessage {
  const content: AppContentBlock[] =
    typeof m.content === "string"
      ? [{ type: "text", text: m.content }]
      : m.content.map((c) => fromContent(c, onUnmapped));
  return { id, role: "user", content, timestamp: m.timestamp };
}

function fromToolResult(m: ToolResultMessage, id: string, onUnmapped: OnUnmapped): AppMessage {
  return {
    id,
    role: "toolResult",
    content: m.content.map((c) => fromContent(c, onUnmapped)),
    toolCallId: m.toolCallId,
    toolName: m.toolName,
    toolDetails: m.details,
    isError: m.isError,
    timestamp: m.timestamp,
  };
}

function fromCompactionSummary(m: CompactionSummaryMessage, id: string): AppMessage {
  return {
    id,
    role: "compactionSummary",
    content: textBlocks(m.summary),
    tokensBefore: m.tokensBefore,
    timestamp: m.timestamp,
  };
}

function fromBranchSummary(m: BranchSummaryMessage, id: string): AppMessage {
  return {
    id,
    role: "branchSummary",
    content: textBlocks(m.summary),
    timestamp: m.timestamp,
  };
}

function fromBashExecution(m: BashExecutionMessage, id: string): AppMessage {
  const errored = m.cancelled || (m.exitCode != null && m.exitCode !== 0);
  return {
    id,
    role: "bashExecution",
    command: m.command,
    content: textBlocks(m.output),
    exitCode: m.exitCode,
    isError: errored,
    timestamp: m.timestamp,
  };
}

function fromCustom(m: CustomMessage, id: string, onUnmapped: OnUnmapped): AppMessage {
  // `display: false` means Pi hides it entirely (extensions use these to store
  // state, not to show); represent that as no content so the renderer skips it.
  const content: AppContentBlock[] = !m.display
    ? []
    : typeof m.content === "string"
      ? textBlocks(m.content)
      : m.content.map((c) => fromContent(c, onUnmapped));
  return {
    id,
    role: "custom",
    customType: m.customType,
    content,
    timestamp: m.timestamp,
  };
}

function fromUnknown(message: AgentMessage, id: string): AppMessage {
  const ts = (message as { timestamp?: number }).timestamp;
  return { id, role: "custom", content: [], timestamp: ts ?? Date.now() };
}

function fromContent(c: LlmContent, onUnmapped: OnUnmapped): AppContentBlock {
  switch (c.type) {
    case "text":
      return { type: "text", text: c.text };
    case "thinking":
      return { type: "thinking", thinking: c.thinking, redacted: c.redacted };
    case "toolCall":
      return { type: "toolCall", id: c.id, name: c.name, arguments: c.arguments };
    case "image":
      // Drop the bytes from the event; carry only a content-addressed reference.
      // The renderer loads the bytes via `yui-attachment://` (see attachment-reader).
      return { type: "image", mimeType: c.mimeType, attachmentId: imageAttachmentId(c.data) };
    default:
      // Unknown content block: surface it but do not crash rendering.
      onUnmapped(`content:${(c as { type?: string }).type ?? "unknown"}`, c);
      return { type: "text", text: "" };
  }
}

function fromUsage(u: Usage): AppUsage {
  return {
    input: u.input,
    output: u.output,
    cacheRead: u.cacheRead,
    cacheWrite: u.cacheWrite,
    totalTokens: u.totalTokens,
    cost: {
      input: u.cost.input,
      output: u.cost.output,
      cacheRead: u.cost.cacheRead,
      cacheWrite: u.cost.cacheWrite,
      total: u.cost.total,
    },
  };
}
