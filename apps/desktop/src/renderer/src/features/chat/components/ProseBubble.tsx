import { CopyButton } from "@renderer/ui/CopyButton";
import { Markdown } from "@renderer/ui/Markdown";

/**
 * Assistant prose. The final answer uses the default full-color presentation;
 * intermediate narration inside the process disclosure uses `tone="quiet"` —
 * smaller, muted, no bubble chrome — so a mid-loop note reads as a step in the
 * run rather than competing with the answer.
 */
export function ProseBubble({
  text,
  streaming,
  showCopy,
  tone = "default",
}: {
  text: string;
  streaming: boolean;
  showCopy: boolean;
  tone?: "default" | "quiet";
}) {
  return (
    <article className="assistant-message" data-tone={tone}>
      <div className="assistant-body">
        <Markdown animated={streaming}>{text}</Markdown>
        {streaming && <span className="caret" />}
      </div>
      {showCopy && (
        <div className="message-actions">
          <CopyButton text={text} size={14} />
        </div>
      )}
    </article>
  );
}
