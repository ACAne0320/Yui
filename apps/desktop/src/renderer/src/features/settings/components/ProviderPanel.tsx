import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@renderer/ui/Icon";
import { ProviderLogo } from "@renderer/ui/ProviderLogo";
import type { ProviderPanelProps } from "../types";
import { ApiKeyForm } from "./ApiKeyForm";
import { ModelList } from "./ModelList";
import { SubscriptionAuth } from "./SubscriptionAuth";

export function ProviderPanel({
  providers,
  models,
  defaults,
  selectedId,
  onSelect,
}: ProviderPanelProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  // Configured (authorized) providers first; the runtime already sorts each
  // group alphabetically and Array.sort is stable, so that order is preserved.
  const orderedProviders = providers.toSorted(
    (a, b) => Number(b.configured) - Number(a.configured),
  );
  const visibleProviders = normalizedQuery
    ? orderedProviders.filter(
        (provider) =>
          provider.displayName.toLowerCase().includes(normalizedQuery) ||
          provider.providerId.toLowerCase().includes(normalizedQuery),
      )
    : orderedProviders;
  const selected =
    providers.find((provider) => provider.providerId === selectedId) ?? orderedProviders[0];
  const providerModels = models.filter((model) => model.providerId === selected?.providerId);
  const formId = selected ? `api-key-${selected.providerId}` : "api-key";

  return (
    <div className="provider-layout">
      <div className="provider-list scroll">
        <div className="provider-toolbar">
          <div className="provider-search">
            <Icon name="search" size={14} />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("settings.providers.search")}
              aria-label={t("settings.providers.search")}
            />
          </div>
        </div>
        {visibleProviders.map((provider) => (
          <button
            key={provider.providerId}
            data-active={provider.providerId === selected?.providerId}
            onClick={() => onSelect(provider.providerId)}
          >
            <span className="provider-logo">
              <ProviderLogo id={provider.providerId} size={24} />
            </span>
            <span>
              <strong>{provider.displayName}</strong>
            </span>
            <i
              data-on={provider.configured}
              role="img"
              aria-label={t(
                provider.configured
                  ? "settings.providers.ready"
                  : "settings.providers.authorizationRequired",
              )}
            />
          </button>
        ))}
        {visibleProviders.length === 0 && (
          <div className="provider-list-empty">{t("settings.providers.empty")}</div>
        )}
      </div>
      {selected ? (
        <div className="provider-detail scroll">
          <div className="provider-head">
            <span className="provider-head-logo">
              <ProviderLogo id={selected.providerId} size={32} />
            </span>
            <div>
              <h3>{selected.displayName}</h3>
              <p>
                {selected.configured
                  ? t("settings.providers.configured")
                  : t(
                      selected.authMethods.length > 1
                        ? "settings.providers.chooseAuthentication"
                        : selected.authMethods[0] === "oauth"
                          ? "settings.providers.connectSubscriptionDescription"
                          : "settings.providers.configure",
                    )}
              </p>
            </div>
            <span className={`status-pill ${selected.configured ? "ready" : "missing"}`}>
              {selected.configured
                ? t("settings.providers.ready")
                : t("settings.providers.authorizationRequired")}
            </span>
          </div>
          {selected.authMethods.includes("oauth") && (
            <SubscriptionAuth key={`oauth-${selected.providerId}`} provider={selected} />
          )}
          {selected.authMethods.includes("api_key") && (
            <ApiKeyForm
              key={`api-key-${selected.providerId}`}
              provider={selected}
              formId={formId}
            />
          )}
          <ModelList models={providerModels} defaults={defaults} />
        </div>
      ) : (
        <div className="provider-detail empty-provider">{t("settings.providers.empty")}</div>
      )}
    </div>
  );
}
