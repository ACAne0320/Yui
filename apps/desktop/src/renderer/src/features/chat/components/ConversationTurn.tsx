import type { AppMessage } from "@yui/contracts";
import { finalReply, runDurationMs } from "../lib";
import type { ChatRealtimeState, LiveTool } from "../types";
import { ExecutionChain } from "./ExecutionChain";
import { Message } from "./Message";

export function ConversationTurn({
  user,
  messages,
  liveTools,
  busy,
  runStartedAt,
  messageStats,
}: {
  user: AppMessage;
  messages: AppMessage[];
  liveTools: LiveTool[];
  busy: boolean;
  runStartedAt?: number;
  messageStats: ChatRealtimeState["messageStats"];
}) {
  // While the run is live, only promote a *settled* message to the answer
  // bubble, so a pre-tool-call preamble never flashes there before relocating
  // to the chain (see finalReply).
  const reply = finalReply(messages, busy);
  const durationMs = runDurationMs(user, reply, reply ? messageStats[reply.id]?.runMs : undefined);
  const trailing = messages.at(-1);
  // The message currently streaming plain text (no tool call yet, not settled).
  // We can't know whether it will become a preamble or the final answer, so it
  // streams in the chain as live output without the "Intermediate reply" label.
  const streamingAssistantId =
    busy &&
    trailing?.role === "assistant" &&
    trailing.stopReason === undefined &&
    !trailing.content.some((block) => block.type === "toolCall")
      ? trailing.id
      : undefined;

  return (
    <section className="conversation-turn">
      <Message message={user} streaming={false} />
      <ExecutionChain
        messages={messages}
        finalAssistantId={reply?.id}
        streamingAssistantId={streamingAssistantId}
        liveTools={liveTools}
        running={busy}
        startedAt={runStartedAt}
        durationMs={durationMs}
      />
      {reply && (
        <Message
          message={reply}
          streaming={busy && trailing?.id === reply.id}
          showAssistantMeta={false}
          showReasoning={false}
        />
      )}
    </section>
  );
}
