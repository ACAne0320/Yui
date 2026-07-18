import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ContextUsage } from "@yui/contracts";
import { api } from "@renderer/lib/api";
import { formatError, formatTokenCount } from "@renderer/lib/format";
import { Popover } from "@renderer/ui/Popover";
import { useChatStore } from "../store";

/**
 * Context gauge in the composer bar: a small progress ring that fills with
 * the session's context usage; hover (or click) opens a popover with the
 * exact numbers. Hidden until a session has usage to report; resets on
 * session switch and refetches when a run settles (usage only advances at
 * message boundaries).
 */
export function ContextGauge() {
  const { t } = useTranslation();
  const sessionId = useChatStore((state) => state.active?.sessionId);
  const busy = useChatStore((state) => state.busy);
  const [usage, setUsage] = useState<ContextUsage | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setUsage(undefined);
    setError(null);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || busy) return;
    let live = true;
    void (async () => {
      try {
        const next = await api.agents.getContextUsage({ sessionId });
        if (live) {
          setUsage(next);
          setError(null);
        }
      } catch (cause) {
        if (live) setError(formatError(cause));
      }
    })();
    return () => {
      live = false;
    };
  }, [sessionId, busy]);

  if (!sessionId || (!usage && !error)) return null;

  const percent = usage?.percent ?? null;
  return (
    <Popover
      align="end"
      trigger={
        <button
          className="composer-button context-gauge"
          data-state={error ? "error" : percent === null ? "unknown" : undefined}
          title={t("chat.context.title")}
        >
          <GaugeRing percent={percent} />
        </button>
      }
    >
      <div className="context-popover">
        <div className="popover-title">{t("chat.context.title")}</div>
        {error ? (
          <span className="context-popover-line">{error}</span>
        ) : usage && percent !== null && usage.tokens !== null ? (
          <>
            <span className="context-popover-line context-popover-strong">
              {t("chat.context.percentUsed", { percent: Math.round(percent) })}
            </span>
            <span className="context-popover-line">
              {formatTokenCount(usage.tokens)} / {formatTokenCount(usage.contextWindow)}
            </span>
          </>
        ) : (
          <span className="context-popover-line">{t("chat.context.usageUnknown")}</span>
        )}
      </div>
    </Popover>
  );
}

function GaugeRing({ percent }: { percent: number | null }) {
  const radius = 6;
  const circumference = 2 * Math.PI * radius;
  const filled = percent === null ? 0 : Math.min(100, Math.max(0, percent)) / 100;
  return (
    <svg
      className="context-gauge-ring"
      width="15"
      height="15"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <circle className="context-gauge-track" cx="8" cy="8" r={radius} />
      <circle
        className="context-gauge-fill"
        cx="8"
        cy="8"
        r={radius}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - filled)}
        transform="rotate(-90 8 8)"
      />
    </svg>
  );
}
