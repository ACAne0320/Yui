import type { AppMessage } from "@yui/contracts";
import { useTranslation } from "react-i18next";
import { CopyButton } from "@renderer/ui/CopyButton";
import { yuiIconSrc } from "@renderer/lib/assets";
import { Markdown } from "@renderer/ui/Markdown";
import { textFromMessage } from "../lib";
import { AttachmentImage } from "./AttachmentImage";
import { Reasoning } from "./Reasoning";
import { ToolCard } from "./ToolCard";

export function Message({
  message,
  streaming,
  showAssistantMeta = true,
  showReasoning = true,
}: {
  message: AppMessage;
  streaming: boolean;
  showAssistantMeta?: boolean;
  showReasoning?: boolean;
}) {
  const { t } = useTranslation();
  if (message.role === "user") {
    const text = textFromMessage(message);
    const images = message.content.filter((block) => block.type === "image");
    return (
      <div className="user-message">
        {images.length > 0 && (
          <div className="message-images">
            {images.map((block, index) => (
              <AttachmentImage
                key={`${block.attachmentId}_${index}`}
                attachmentId={block.attachmentId}
              />
            ))}
          </div>
        )}
        {text}
      </div>
    );
  }

  if (message.role === "assistant") {
    const thinking = message.content
      .filter((block) => block.type === "thinking")
      .map((block) => block.thinking)
      .join("\n");
    const text = textFromMessage(message);
    return (
      <article className="assistant-message">
        {showAssistantMeta && (
          <div className="assistant-meta">
            <img src={yuiIconSrc} alt="" />
            <strong>Yui</strong>
            {message.model && <span>{message.model}</span>}
          </div>
        )}
        {showReasoning && thinking && <Reasoning text={thinking} streaming={streaming && !text} />}
        {text && (
          <div className="assistant-body">
            <Markdown animated={streaming}>{text}</Markdown>
            {streaming && <span className="caret" />}
          </div>
        )}
        {(message.errorMessage || message.stopReason === "error") && (
          <div className="message-error">{message.errorMessage || t("chat.notices.runFailed")}</div>
        )}
        {!streaming && text && (
          <div className="message-actions">
            <CopyButton text={text} size={14} />
          </div>
        )}
      </article>
    );
  }

  if (message.role === "toolResult") {
    const text = textFromMessage(message);
    return (
      <ToolCard
        name={message.toolName ?? t("chat.tools.result")}
        // Reassemble the AgentToolResult shape when structured details were
        // persisted, so rich renderings (subagent task cards) survive
        // completion and session reload.
        detail={
          message.toolDetails !== undefined
            ? { content: [{ type: "text", text }], details: message.toolDetails }
            : text
        }
        running={false}
        error={message.isError}
      />
    );
  }

  const label = {
    bashExecution: message.command ? `$ ${message.command}` : t("chat.tools.command"),
    compactionSummary: t("chat.messages.compactionSummary"),
    branchSummary: t("chat.messages.branchSummary"),
    custom: message.customType ?? t("chat.messages.systemMessage"),
  }[message.role];
  if (!message.content.length) return null;
  return (
    <div className="system-message">
      <strong>{label}</strong>
      <span>{textFromMessage(message)}</span>
    </div>
  );
}
