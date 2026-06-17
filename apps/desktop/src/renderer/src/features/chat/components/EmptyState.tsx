import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { yuiIconSrc } from "@renderer/lib/assets";
import { Icon } from "@renderer/ui/Icon";

export function EmptyState({
  hasModels,
  onOpenSettings,
  composer,
}: {
  hasModels: boolean;
  onOpenSettings: () => void;
  composer: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="empty-state">
      <div className="empty-content">
        <img className="empty-avatar" src={yuiIconSrc} alt="Yui" />
        <h1>
          <span>Yui</span>
          <span>{t("chat.empty.titleSuffix")}</span>
        </h1>
        <p>{t("chat.empty.subtitle")}</p>
        {!hasModels && (
          <button className="setup-callout" onClick={onOpenSettings}>
            <Icon name="key" size={16} />
            <span>{t("chat.empty.connectProvider")}</span>
            <Icon name="chevron" size={14} />
          </button>
        )}
        {composer}
      </div>
    </div>
  );
}
