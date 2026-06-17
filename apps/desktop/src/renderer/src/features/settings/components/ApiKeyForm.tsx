import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { ProviderStatus } from "@yui/contracts";
import { useRemoveApiKey, useSetApiKey } from "@renderer/data/auth";
import { formatError } from "@renderer/lib/format";
import { Icon } from "@renderer/ui/Icon";

interface ApiKeyValues {
  apiKey: string;
}

export function ApiKeyForm({ provider, formId }: { provider: ProviderStatus; formId: string }) {
  const { t } = useTranslation();
  const [reveal, setReveal] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const setApiKey = useSetApiKey();
  const removeApiKey = useRemoveApiKey();
  // Pre-fill the stored key (when present) so the user can review and edit it.
  const stored = provider.apiKey ?? "";
  const form = useForm<ApiKeyValues>({ defaultValues: { apiKey: stored } });

  // Persist whatever is in the field. A non-empty change is saved; emptying the
  // field clears the credential. Both mutations invalidate the providers/models
  // queries, so the model list re-renders automatically. Called on blur (and on
  // explicit submit) so the user never has to press a separate Save button.
  const persist = async () => {
    const next = form.getValues("apiKey").trim();
    if (next === stored) return;
    try {
      if (next.length === 0) {
        await removeApiKey.mutateAsync({ providerId: provider.providerId });
        setFeedback(t("settings.providers.authorizationRemoved"));
      } else {
        await setApiKey.mutateAsync({ providerId: provider.providerId, apiKey: next });
        setFeedback(t("settings.providers.apiKeySaved"));
      }
    } catch (error) {
      setFeedback(formatError(error));
    }
  };

  return (
    <form
      id={formId}
      onSubmit={(event) => {
        event.preventDefault();
        void persist();
      }}
      className="settings-section"
    >
      <label htmlFor={`${formId}-key`}>API Key</label>
      <div className="api-key-row">
        <input
          id={`${formId}-key`}
          type={reveal ? "text" : "password"}
          placeholder={
            provider.configured
              ? t("settings.providers.configuredThrough", {
                  source: provider.authSource ?? t("settings.providers.credentials"),
                })
              : t("settings.providers.inputApiKey")
          }
          {...form.register("apiKey", {
            onChange: () => setFeedback(null),
            onBlur: () => void persist(),
          })}
        />
        <button
          type="button"
          onClick={() => setReveal((value) => !value)}
          title={t("settings.providers.reveal")}
        >
          <Icon name={reveal ? "eyeOff" : "eye"} size={15} />
        </button>
      </div>
      {feedback && (
        <div className="credential-actions">
          <span>{feedback}</span>
        </div>
      )}
    </form>
  );
}
