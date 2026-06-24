import { memo } from "react";
import type { AppMessage } from "@yui/contracts";
import { buildTurnSegments, finalReply, runDurationMs, textFromMessage } from "../lib";
import type { ChatRealtimeState, LiveTool } from "../types";
import { Message } from "./Message";
import { ProcessDisclosure } from "./ProcessDisclosure";
import { ProseBubble } from "./ProseBubble";

interface ConversationTurnProps {
  user: AppMessage;
  messages: AppMessage[];
  liveTools: LiveTool[];
  busy: boolean;
  runStartedAt?: number;
  messageStats: ChatRealtimeState["messageStats"];
}

/** Element-wise reference check — the reducer keeps unchanged messages' object
    identity (only the upserted message is replaced), so a settled turn's array
    compares equal even though `conversationTurns` rebuilds it each render. */
function sameMessages(a: AppMessage[], b: AppMessage[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

// A streaming reply fires a store update per token, re-rendering the whole
// thread. Without this guard every settled turn re-parses its markdown on every
// token of the live turn — for a long conversation that saturates the renderer,
// throttling perceived output and starving UI input (the Stop button). Only the
// active turn's props actually change between tokens, so the rest skip the work.
function turnsEqual(prev: ConversationTurnProps, next: ConversationTurnProps): boolean {
  return (
    prev.user === next.user &&
    prev.busy === next.busy &&
    prev.runStartedAt === next.runStartedAt &&
    prev.messageStats === next.messageStats &&
    prev.liveTools === next.liveTools &&
    sameMessages(prev.messages, next.messages)
  );
}

export const ConversationTurn = memo(function ConversationTurn({
  user,
  messages,
  liveTools,
  busy,
  runStartedAt,
  messageStats,
}: ConversationTurnProps) {
  // The trailing assistant text is the answer bubble even while it streams, so
  // the typing animation plays where the answer actually lands. Its text is kept
  // out of the disclosure (finalReply.id). If a tool call follows, that message
  // stops qualifying and its text settles back into the disclosure instead.
  const reply = finalReply(messages);
  // The reply animates as long as the run is live and it is the trailing message
  // — NOT gated on a settled stopReason. Providers (e.g. DeepSeek) set stopReason
  // while the text is still streaming, so requiring `stopReason === undefined`
  // here would silence the typing animation for the whole reply.
  const streamingReply = reply !== undefined && busy && reply.id === messages.at(-1)?.id;
  // The disclosure still folds once the reply settles (Codex-style): thinking
  // stays expanded while working, collapses when the answer arrives.
  const settled = reply !== undefined && reply.stopReason !== undefined;
  const segments = buildTurnSegments(messages, liveTools, busy, reply?.id);
  const durationMs = runDurationMs(user, reply, reply ? messageStats[reply.id]?.runMs : undefined);

  return (
    <section className="conversation-turn">
      <Message message={user} streaming={false} />
      {segments.length > 0 && (
        <ProcessDisclosure
          segments={segments}
          running={busy}
          working={busy && !settled}
          startedAt={runStartedAt}
          durationMs={durationMs}
        />
      )}
      {reply && (
        <ProseBubble
          text={textFromMessage(reply)}
          streaming={streamingReply}
          showCopy={!streamingReply}
        />
      )}
    </section>
  );
}, turnsEqual);
