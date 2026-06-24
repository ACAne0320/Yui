import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { AppMessage } from "@yui/contracts";
import { shortPath } from "@renderer/lib/format";
import { Icon } from "@renderer/ui/Icon";
import { conversationTurns } from "../lib";
import type { ActiveConversation, ChatRealtimeState, LiveTool } from "../types";
import { ConversationTurn } from "./ConversationTurn";
import { Message } from "./Message";
import { ThreadTitle } from "./ThreadTitle";
import { ToolCard } from "./ToolCard";

/** How close to the bottom (px) still counts as "following the stream". */
const PIN_THRESHOLD_PX = 40;

/** Stable empty tools for settled turns — a fresh `[]` each render would break
    ConversationTurn's memo and re-parse every turn on every streamed token. */
const NO_LIVE_TOOLS: LiveTool[] = [];

export function Thread({
  active,
  messages,
  liveTools,
  queue,
  activity,
  busy,
  workingMessage,
  messageStats = {},
  runStartedAt,
  onOpenCwd,
  composer,
}: {
  active: ActiveConversation | null;
  messages: AppMessage[];
  liveTools: LiveTool[];
  queue: string[];
  activity: ChatRealtimeState["activity"];
  busy: boolean;
  /** Extension override for the streaming indicator label. */
  workingMessage?: string;
  /** Live-measured run durations; history derives them from persisted timestamps. */
  messageStats?: ChatRealtimeState["messageStats"];
  /** Exact agent_start time for the active user request; drives the live counter. */
  runStartedAt?: number;
  onOpenCwd: () => void;
  composer: ReactNode;
}) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const grouped = useMemo(() => conversationTurns(messages), [messages]);
  const turnCount = useMemo(
    () => messages.filter((message) => message.role === "user").length,
    [messages],
  );
  // Follow the stream only while the user is pinned to the bottom; scrolling up
  // to read history must not be undone by the next delta.
  const pinnedToBottom = useRef(true);
  // Set while a click-triggered smooth scroll is animating toward the bottom, so the
  // intermediate scroll events it fires don't flip the button back on mid-flight.
  const programmaticScroll = useRef(false);
  const lastScrollTop = useRef(0);
  const onScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    const atBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight < PIN_THRESHOLD_PX;
    const scrolledUp = element.scrollTop < lastScrollTop.current;
    lastScrollTop.current = element.scrollTop;
    // While our own smooth scroll animates downward, ignore the scroll events it emits
    // so the button stays hidden. Resume normal handling once we reach the bottom, or
    // the moment the user scrolls back up to interrupt the animation.
    if (programmaticScroll.current) {
      if (!atBottom && !scrolledUp) return;
      programmaticScroll.current = false;
    }
    pinnedToBottom.current = atBottom;
    setShowScrollToBottom(!atBottom);
  };
  useEffect(() => {
    pinnedToBottom.current = true;
    programmaticScroll.current = false;
    setShowScrollToBottom(false);
  }, [active?.sessionPath]);
  useEffect(() => {
    const element = scrollRef.current;
    if (element && pinnedToBottom.current) element.scrollTop = element.scrollHeight;
  }, [liveTools, messages, queue]);
  const scrollToBottom = () => {
    const element = scrollRef.current;
    if (!element) return;
    programmaticScroll.current = true;
    lastScrollTop.current = element.scrollTop;
    pinnedToBottom.current = true;
    setShowScrollToBottom(false);
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  };

  return (
    <div className="thread-pane">
      <header className="thread-header">
        <span>{t("chat.thread.turnCount", { count: turnCount })}</span>
        <i />
        <strong>
          <ThreadTitle />
        </strong>
        {active?.cwd && (
          <button
            className="thread-cwd"
            title={t("chat.thread.openDirectory", { path: active.cwd })}
            onClick={onOpenCwd}
          >
            <Icon name="folder" size={12} />
            <span>{shortPath(active.cwd)}</span>
          </button>
        )}
      </header>
      <div className="thread-scroll-shell">
        <div className="thread scroll" ref={scrollRef} onScroll={onScroll}>
          <div className="thread-inner">
            {grouped.leading.map((message, index) => (
              <Message
                key={message.id}
                message={message}
                streaming={
                  busy && grouped.turns.length === 0 && index === grouped.leading.length - 1
                }
              />
            ))}
            {grouped.turns.map((turn, index) => {
              const activeTurn = index === grouped.turns.length - 1;
              return (
                <ConversationTurn
                  key={turn.user.id}
                  user={turn.user}
                  messages={turn.messages}
                  liveTools={activeTurn ? liveTools : NO_LIVE_TOOLS}
                  busy={activeTurn && busy}
                  runStartedAt={activeTurn && busy ? runStartedAt : undefined}
                  messageStats={messageStats}
                />
              );
            })}
            {grouped.turns.length === 0 &&
              liveTools.map((tool) => (
                <ToolCard
                  key={tool.toolCallId}
                  name={tool.name}
                  detail={tool.running ? (tool.result ?? tool.args) : tool.result}
                  args={tool.args}
                  running={tool.running}
                  error={tool.isError}
                />
              ))}
            {queue.length > 0 && (
              <div className="queue-card">
                <Icon name="clock" size={14} />
                <span>{t("chat.thread.queued", { count: queue.length })}</span>
              </div>
            )}
            {(activity || (busy && messages.at(-1)?.role !== "assistant")) && (
              <div className="thinking-pending">
                <span className="typing-dots">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="shimmer-text">
                  {activity?.type === "compacting"
                    ? t("chat.thread.compacting")
                    : activity?.type === "retrying"
                      ? t("chat.thread.retrying", activity)
                      : (workingMessage ?? t("chat.thread.thinking"))}
                </span>
              </div>
            )}
          </div>
        </div>
        {showScrollToBottom && (
          <button
            className="thread-scroll-bottom"
            aria-label={t("chat.thread.scrollToBottom")}
            title={t("chat.thread.scrollToBottom")}
            onClick={scrollToBottom}
          >
            <Icon name="chevron" size={17} />
          </button>
        )}
      </div>
      <div className="thread-composer">{composer}</div>
    </div>
  );
}
