import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@renderer/ui/Icon";
import { formatDuration, type TurnSegment } from "../lib";
import { Message } from "./Message";
import { ProseBubble } from "./ProseBubble";
import { Reasoning } from "./Reasoning";
import { ToolCard } from "./ToolCard";

/**
 * Outer disclosure: the whole turn's reasoning + tool calls + intermediate
 * prose, summarized by total processing time. Collapsed by default once the run
 * settles, leaving only the final answer below; expand to replay the run, where
 * each tool call and thinking block carries its own inner toggle (second layer).
 */
export function ProcessDisclosure({
  segments,
  running,
  working,
  startedAt,
  durationMs,
}: {
  segments: TurnSegment[];
  /** The whole run is still in flight — keeps the live counter ticking. */
  running: boolean;
  /** No settled reply yet — keeps the disclosure auto-expanded. */
  working: boolean;
  startedAt?: number;
  durationMs?: number;
}) {
  const { t } = useTranslation();
  // Auto-expand while there is no answer yet, fold back to the summary once the
  // reply settles; a manual toggle in between sticks until the next transition.
  const [open, setOpen] = useState(working);
  useEffect(() => {
    setOpen(working);
  }, [working]);

  // Live elapsed time. Read from Date.now() at render so it stays current even
  // when a fast token stream re-renders this component many times a second (a
  // 1s setInterval gets starved in that flood and the counter would freeze). The
  // interval only forces a re-render each second for the idle case (e.g. a long
  // tool call with no streaming). Tracks `running` (not `working`) so the time
  // keeps counting after the answer settles, until the run ends and runMs lands.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!running || startedAt === undefined) return;
    const interval = window.setInterval(() => forceTick((value) => value + 1), 1_000);
    return () => window.clearInterval(interval);
  }, [running, startedAt]);

  const elapsed = startedAt === undefined ? 0 : Math.max(0, Date.now() - startedAt);
  const label = running
    ? startedAt === undefined
      ? t("chat.process.working")
      : t("chat.process.workingIn", { duration: formatDuration(elapsed, t) })
    : durationMs === undefined
      ? t("chat.process.completed")
      : t("chat.process.done", { duration: formatDuration(durationMs, t) });

  return (
    <section className="process-chain" data-open={open} data-running={running}>
      <button onClick={() => setOpen((value) => !value)}>
        <span className="process-status">
          {working ? <span className="spinner" /> : <Icon name="clock" size={14} />}
        </span>
        <span className="process-summary">{label}</span>
        <Icon name="chevron" size={13} />
      </button>
      {open && (
        <div className="process-reveal">
          <div className="process-details">
            {segments.map((segment) => {
              if (segment.kind === "prose")
                return (
                  <ProseBubble
                    key={segment.id}
                    text={segment.text}
                    streaming={segment.live}
                    showCopy={false}
                  />
                );
              if (segment.kind === "reasoning")
                return <Reasoning key={segment.id} text={segment.text} streaming={false} />;
              if (segment.kind === "tool")
                return (
                  <ToolCard
                    key={segment.id}
                    name={segment.name}
                    args={segment.args}
                    detail={segment.detail}
                    running={segment.running}
                    error={segment.error}
                  />
                );
              return (
                <Message
                  key={segment.id}
                  message={segment.message}
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
