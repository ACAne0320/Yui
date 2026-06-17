import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { changeLocale, currentLocale, type SupportedLocale } from "@renderer/i18n";

const locales: SupportedLocale[] = ["en-US", "zh-CN"];

function SetGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="set-group">
      <div className="set-group-title">{title}</div>
      <div className="set-rows">{children}</div>
    </div>
  );
}

function SetRow({ label, desc, children }: { label: string; desc?: string; children: ReactNode }) {
  return (
    <div className="set-row">
      <div className="sr-text">
        <div className="sr-label">{label}</div>
        {desc ? <div className="sr-desc">{desc}</div> : null}
      </div>
      <div className="sr-control">{children}</div>
    </div>
  );
}

export function GeneralPanel() {
  const { t } = useTranslation();
  const locale = currentLocale();

  return (
    <div className="panel-scroll scroll">
      <SetGroup title={t("settings.general.appearance")}>
        <SetRow
          label={t("settings.general.language")}
          desc={t("settings.general.languageDescription")}
        >
          <div className="segmented">
            {locales.map((item) => (
              <button key={item} data-on={locale === item} onClick={() => void changeLocale(item)}>
                {item === "en-US" ? t("settings.general.english") : t("settings.general.chinese")}
              </button>
            ))}
          </div>
        </SetRow>
      </SetGroup>

      <SetGroup title={t("settings.general.shortcuts")}>
        <SetRow
          label={t("settings.general.openSearch")}
          desc={t("settings.general.openSearchDescription")}
        >
          <span className="kbd-group">
            <kbd>⌘</kbd>
            <kbd>K</kbd>
          </span>
        </SetRow>
        <SetRow label={t("settings.general.newChat")}>
          <span className="kbd-group">
            <kbd>⌘</kbd>
            <kbd>N</kbd>
          </span>
        </SetRow>
      </SetGroup>
    </div>
  );
}
