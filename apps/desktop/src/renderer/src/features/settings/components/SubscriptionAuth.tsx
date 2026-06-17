import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { ProviderStatus } from "@yui/contracts";
import {
  useBeginOAuthLogin,
  useCancelOAuthLogin,
  useOAuthLoginState,
  useRemoveApiKey,
  useRespondToOAuthLogin,
} from "@renderer/data/auth";
import { queryKeys } from "@renderer/data/keys";
import { formatError } from "@renderer/lib/format";
import { CopyButton } from "@renderer/ui/CopyButton";
import { Icon } from "@renderer/ui/Icon";

export function SubscriptionAuth({ provider }: { provider: ProviderStatus }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [flowId, setFlowId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const begin = useBeginOAuthLogin();
  const stateQuery = useOAuthLoginState(flowId);
  const respond = useRespondToOAuthLogin();
  const cancel = useCancelOAuthLogin();
  const disconnect = useRemoveApiKey();
  const state = stateQuery.data ?? (begin.data?.flowId === flowId ? begin.data : undefined);

  useEffect(() => {
    setInput("");
  }, [state?.prompt?.requestId]);

  useEffect(() => {
    if (state?.status !== "succeeded") return;
    void Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.providers }),
      client.invalidateQueries({ queryKey: queryKeys.models }),
    ]);
    // Hold the success state briefly so the confirmation is visible before the
    // card collapses into the connected state.
    const timer = setTimeout(() => setFlowId(null), 1400);
    return () => clearTimeout(timer);
  }, [client, state?.status]);

  const start = async () => {
    setFeedback(null);
    try {
      const next = await begin.mutateAsync({ providerId: provider.providerId });
      setFlowId(next.flowId);
    } catch (error) {
      setFeedback(formatError(error));
    }
  };

  const answer = async (value: string) => {
    if (!state?.prompt) return;
    await respond.mutateAsync({
      flowId: state.flowId,
      requestId: state.prompt.requestId,
      response: { kind: "value", value },
    });
  };

  return (
    <div className="settings-section auth-method-section">
      <label>{t("settings.providers.subscription")}</label>
      <p className="auth-method-desc">{t("settings.providers.subscriptionDescription")}</p>

      {provider.providerId === "anthropic" && (
        <p className="auth-method-note">{t("settings.providers.anthropicExtraUsage")}</p>
      )}

      {provider.credentialType === "oauth" && !state ? (
        <div className="auth-connected-card">
          <span>
            <Icon name="checkCircle" size={15} />
            {t("settings.providers.subscriptionConnected")}
          </span>
          <button
            className="danger-button"
            type="button"
            onClick={() => void disconnect.mutateAsync({ providerId: provider.providerId })}
          >
            {t("settings.providers.disconnect")}
          </button>
        </div>
      ) : !state ? (
        <button
          className="primary-button auth-connect-button"
          type="button"
          onClick={() => void start()}
        >
          <Icon name="globe" size={14} />
          {t("settings.providers.connectSubscription")}
        </button>
      ) : (
        <div className="oauth-flow-card">
          <div className="oauth-flow-status">
            <strong>{state.providerName}</strong>
            <span className="oauth-status-badge" data-status={state.status}>
              {state.status === "running" && !state.prompt && (
                <span className="spinner" aria-hidden="true" />
              )}
              {t(`settings.providers.oauthStatus.${state.status}`)}
            </span>
          </div>

          {state.status === "succeeded" && (
            <div className="oauth-success">
              <Icon name="checkCircle" size={18} />
              <span>{t("settings.providers.subscriptionConnected")}</span>
            </div>
          )}

          {state.message && <p>{state.message}</p>}
          {state.authUrl && (
            <a className="outline-button" href={state.authUrl} target="_blank" rel="noreferrer">
              <Icon name="globe" size={14} />
              {t("settings.providers.openLoginPage")}
            </a>
          )}
          {state.instructions && <p>{state.instructions}</p>}
          {state.deviceCode && (
            <div className="oauth-device-code">
              <div className="oauth-device-code-row">
                <code>{state.deviceCode.userCode}</code>
                <CopyButton text={state.deviceCode.userCode} size={15} className="oauth-copy" />
              </div>
              <a
                className="outline-button"
                href={state.deviceCode.verificationUri}
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="globe" size={14} />
                {t("settings.providers.openDevicePage")}
              </a>
            </div>
          )}

          {state.prompt?.kind === "select" && (
            <div className="oauth-options">
              {state.prompt.options?.map((option) => {
                const isDevice = option.id.includes("device");
                return (
                  <button
                    className="oauth-option"
                    type="button"
                    key={option.id}
                    onClick={() => void answer(option.id)}
                  >
                    <Icon name={isDevice ? "terminal" : "globe"} size={16} />
                    <span className="oauth-option-text">
                      <strong>{option.label}</strong>
                      <small>
                        {t(
                          isDevice
                            ? "settings.providers.oauthMethodDesc.device"
                            : "settings.providers.oauthMethodDesc.browser",
                        )}
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {state.prompt && state.prompt.kind !== "select" && (
            <form
              className="oauth-input"
              onSubmit={(event) => {
                event.preventDefault();
                if (input.trim()) void answer(input.trim());
              }}
            >
              <label htmlFor={`oauth-${state.prompt.requestId}`}>{state.prompt.message}</label>
              <div className="api-key-row">
                <input
                  id={`oauth-${state.prompt.requestId}`}
                  value={input}
                  placeholder={state.prompt.placeholder}
                  onChange={(event) => setInput(event.target.value)}
                />
                <button type="submit" title={t("settings.providers.submitOAuthResponse")}>
                  <Icon name="send" size={14} />
                </button>
              </div>
            </form>
          )}

          {(state.status === "running" ||
            state.status === "failed" ||
            state.status === "cancelled") && (
            <div className="oauth-flow-actions">
              {state.status === "running" && (
                <button
                  className="outline-button"
                  type="button"
                  onClick={() => void cancel.mutateAsync({ flowId: state.flowId })}
                >
                  {t("common.actions.cancel")}
                </button>
              )}
              {(state.status === "failed" || state.status === "cancelled") && (
                <button className="outline-button" type="button" onClick={() => void start()}>
                  {t("settings.providers.tryAgain")}
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {feedback && (
        <div className="credential-actions">
          <span>{feedback}</span>
        </div>
      )}
    </div>
  );
}
