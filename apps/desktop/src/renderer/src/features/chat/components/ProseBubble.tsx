import { CopyButton } from "@renderer/ui/CopyButton";
import { Markdown } from "@renderer/ui/Markdown";

/**
 * Assistant prose rendered as a full-color bubble. Intermediate replies (text
 * emitted before a tool call) and the final answer share this component, so a
 * mid-loop message reads the same as the conclusion instead of being demoted
 * into the collapsed process stream.
 */
export function ProseBubble({
  text,
  streaming,
  showCopy,
}: {
  text: string;
  streaming: boolean;
  showCopy: boolean;
}) {
  return (
    <article className="assistant-message">
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
