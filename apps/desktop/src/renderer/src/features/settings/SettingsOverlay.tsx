import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useProviders } from "@renderer/data/auth";
import { useModels } from "@renderer/data/models";
import { useDefaults } from "@renderer/data/settings";
import { type SettingsSection, useUiStore } from "@renderer/stores/ui-store";
import { Icon, type IconName } from "@renderer/ui/Icon";
import { AboutPanel } from "./components/AboutPanel";
import { ExtensionsPanel } from "./components/ExtensionsPanel";
import { GeneralPanel } from "./components/GeneralPanel";
import { ProviderPanel } from "./components/ProviderPanel";
import { SubagentsPanel } from "./components/SubagentsPanel";

const sections: Array<{ id: SettingsSection; icon: IconName }> = [
  { id: "general", icon: "settings" },
  { id: "providers", icon: "model" },
  { id: "subagents", icon: "chat" },
  { id: "extensions", icon: "puzzle" },
  { id: "about", icon: "info" },
];

export function SettingsOverlay() {
  const { t } = useTranslation();
  const providersQuery = useProviders();
  const modelsQuery = useModels();
  const defaultsQuery = useDefaults();
  const setSettingsOpen = useUiStore((state) => state.setSettingsOpen);
  const section = useUiStore((state) => state.settingsSection);
  const setSection = useUiStore((state) => state.setSettingsSection);
  const [selectedId, setSelectedId] = useState("");

  const providers = providersQuery.data ?? [];

  useEffect(() => {
    if (!selectedId && providers[0]) setSelectedId(providers[0].providerId);
  }, [providers, selectedId]);

  return (
    <div className="settings-overlay">
      <aside className="settings-nav">
        <button className="settings-back" onClick={() => setSettingsOpen(false)}>
          <Icon name="arrowLeft" size={16} />
          <span>{t("settings.back")}</span>
        </button>
        <div className="settings-nav-title">{t("settings.title")}</div>
        {sections.map(({ id, icon }) => (
          <button key={id} data-active={section === id} onClick={() => setSection(id)}>
            <Icon name={icon} size={16} />
            <span>{t(`settings.${id}.label`)}</span>
          </button>
        ))}
      </aside>
      <section className="settings-main">
        <header className="settings-header">
          <div>
            <span>{t(`settings.${section}.eyebrow`)}</span>
            <h2>{t(`settings.${section}.title`)}</h2>
          </div>
          {section === "providers" && (
            <button className="outline-button" title={t("settings.providers.customSoon")}>
              <Icon name="plus" size={14} />
              {t("settings.providers.addCustomModel")}
            </button>
          )}
        </header>
        {section === "general" && <GeneralPanel />}
        {section === "providers" && (
          <ProviderPanel
            providers={providers}
            models={modelsQuery.data ?? []}
            defaults={defaultsQuery.data ?? {}}
            selectedId={selectedId}
            onSelect={(providerId) => setSelectedId(providerId)}
          />
        )}
        {section === "subagents" && <SubagentsPanel />}
        {section === "extensions" && <ExtensionsPanel />}
        {section === "about" && <AboutPanel />}
      </section>
    </div>
  );
}
