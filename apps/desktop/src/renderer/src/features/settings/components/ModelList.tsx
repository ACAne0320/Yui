import type { AppDefaults, AppModel } from "@yui/contracts";
import { useTranslation } from "react-i18next";
import { useSetDefaultModel } from "@renderer/data/settings";
import { formatError } from "@renderer/lib/format";
import { modelKey } from "@renderer/lib/model";
import { useUiStore } from "@renderer/stores/ui-store";
import { Icon } from "@renderer/ui/Icon";

export function ModelList({ models, defaults }: { models: AppModel[]; defaults: AppDefaults }) {
  const { t } = useTranslation();
  const setDefault = useSetDefaultModel();
  const setNotice = useUiStore((state) => state.setNotice);
  return (
    <div className="settings-section models-section">
      <div className="section-heading">
        <div>
          <label>{t("settings.providers.chatModels")}</label>
          <p>{t("settings.providers.chatModelsDescription")}</p>
        </div>
        <span>{models.length}</span>
      </div>
      {models.length ? (
        <div className="settings-models">
          {models.map((model) => {
            const isDefault =
              defaults.providerId === model.providerId && defaults.modelId === model.modelId;
            return (
              <div key={modelKey(model)} className="settings-model-row">
                <span className="provider-logo">
                  <Icon name="model" size={15} />
                </span>
                <span>
                  <strong>{model.name}</strong>
                  <small>
                    {t("settings.providers.context", {
                      count: Math.round(model.contextWindow / 1000),
                    })}
                    {model.reasoning ? ` · ${t("settings.providers.reasoning")}` : ""}
                  </small>
                </span>
                <button
                  disabled={isDefault || setDefault.isPending}
                  onClick={() =>
                    void setDefault
                      .mutateAsync({ providerId: model.providerId, modelId: model.modelId })
                      .catch((error: unknown) => setNotice(formatError(error)))
                  }
                >
                  {isDefault
                    ? t("settings.providers.defaultModel")
                    : t("settings.providers.setDefault")}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="models-empty">
          <Icon name="key" size={18} />
          <span>{t("settings.providers.modelsEmpty")}</span>
        </div>
      )}
    </div>
  );
}
