import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ExtensionUiRequest, RespondToExtensionUiInput } from "@yui/contracts";
import { api } from "@renderer/lib/api";
import { formatError } from "@renderer/lib/format";
import { useUiStore } from "@renderer/stores/ui-store";
import { useChatStore } from "../store";

type ExtensionUiResponse = RespondToExtensionUiInput["response"];

/**
 * Modal for extension dialog requests (select / confirm / input / editor).
 * Shows pending requests one at a time in FIFO order. It must stay answerable
 * while the session is busy: extensions raise confirms from inside tool
 * execution, and blocking the answer would deadlock the tool.
 */
export function ExtensionRequestDialog() {
  const request = useChatStore((state) => state.extensionUi.pendingRequests[0]);
  if (!request) return null;
  // Remount per request so draft input and countdown reset.
  return <RequestModal key={request.requestId} request={request} />;
}

function RequestModal({ request }: { request: ExtensionUiRequest }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(request.kind === "editor" ? (request.prefill ?? "") : "");
  const expiresAt = request.kind === "editor" ? undefined : request.expiresAt;
  const remaining = useCountdown(expiresAt);

  const respond = async (response: ExtensionUiResponse) => {
    const sessionId = useChatStore.getState().active?.sessionId;
    if (sessionId) {
      try {
        await api.agents.respondToExtensionUi({
          sessionId,
          requestId: request.requestId,
          response,
        });
      } catch (error) {
        useUiStore.getState().setNotice(formatError(error));
      }
    }
    // Close locally: answered requests get no dismiss event from the backend.
    useChatStore.setState((state) => ({
      extensionUi: {
        ...state.extensionUi,
        pendingRequests: state.extensionUi.pendingRequests.filter(
          (pending) => pending.requestId !== request.requestId,
        ),
      },
    }));
  };

  const cancel = () => void respond({ kind: "cancelled" });

  return (
    <div className="extension-dialog-overlay" role="presentation">
      <div className="extension-dialog" role="dialog" aria-modal="true" aria-label={request.title}>
        <span className="extension-dialog-eyebrow">{t("chat.extensions.dialogEyebrow")}</span>
        <h3>{request.title}</h3>

        {request.kind === "confirm" && <p className="extension-dialog-text">{request.message}</p>}

        {request.kind === "select" && (
          <div className="extension-dialog-options">
            {request.options.map((option) => (
              <button
                key={option}
                className="popover-item"
                onClick={() => void respond({ kind: "value", value: option })}
              >
                <span>{option}</span>
              </button>
            ))}
          </div>
        )}

        {request.kind === "input" && (
          <input
            autoFocus
            value={draft}
            placeholder={request.placeholder ?? ""}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void respond({ kind: "value", value: draft });
            }}
          />
        )}

        {request.kind === "editor" && (
          <textarea
            autoFocus
            rows={8}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        )}

        <div className="extension-dialog-actions">
          {remaining !== null && (
            <span className="extension-dialog-countdown">
              {t("chat.extensions.countdown", { seconds: remaining })}
            </span>
          )}
          <button className="outline-button" onClick={cancel}>
            {t("chat.extensions.cancel")}
          </button>
          {request.kind === "confirm" && (
            <button
              className="primary-button"
              onClick={() => void respond({ kind: "confirmed", confirmed: true })}
            >
              {t("chat.extensions.confirm")}
            </button>
          )}
          {(request.kind === "input" || request.kind === "editor") && (
            <button
              className="primary-button"
              onClick={() => void respond({ kind: "value", value: draft })}
            >
              {t("chat.extensions.submit")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Seconds left until `expiresAt`, ticking every 500ms; null when no timeout. */
function useCountdown(expiresAt: number | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [expiresAt]);
  if (!expiresAt) return null;
  return Math.max(0, Math.ceil((expiresAt - now) / 1000));
}
