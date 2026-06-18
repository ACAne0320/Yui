import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useUiStore } from "@renderer/stores/ui-store";
import { useUpdateStore } from "@renderer/stores/update-store";
import { Icon } from "@renderer/ui/Icon";

const REPO_URL = "https://github.com/ACAne0320/Yui";
const AUTHOR_URL = "https://github.com/ACAne0320";

function SetGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="set-group">
      <div className="set-group-title">{title}</div>
      <div className="set-rows">{children}</div>
    </div>
  );
}

/**
 * The settings "About" panel: shows the running version and the manual
 * entry point into the update flow. It deliberately owns no update logic —
 * checking goes through the shared update store, and the actual "what's new +
 * install" lives in {@link UpdateDialog}, which this panel opens via
 * `setUpdateOpen` (the same modal the sidebar entry uses).
 */
export function AboutPanel() {
  const { t } = useTranslation();
  const state = useUpdateStore((store) => store.state);
  const check = useUpdateStore((store) => store.check);
  const setUpdateOpen = useUiStore((store) => store.setUpdateOpen);

  const phase = state?.phase ?? "idle";
  const supported = state?.supported ?? false;
  const checking = phase === "checking";
  // Keep the entry into the dialog visible through the whole download so the
  // user always has a way back to the install button.
  const hasUpdate = phase === "available" || phase === "downloading" || phase === "downloaded";
  const percent = Math.round((state?.downloadProgress ?? 0) * 100);

  const status = !supported
    ? t("settings.about.statusUnsupported")
    : phase === "checking"
      ? t("settings.about.statusChecking")
      : phase === "available"
        ? t("settings.about.statusAvailable", { version: state?.latest?.version ?? "" })
        : phase === "downloading"
          ? t("settings.about.statusDownloading", { percent })
          : phase === "downloaded"
            ? t("settings.about.statusDownloaded")
            : phase === "error"
              ? t("settings.about.statusError")
              : t("settings.about.statusUpToDate");

  return (
    <div className="panel-scroll scroll">
      <SetGroup title={t("settings.about.app")}>
        <div className="about-identity">
          <div className="about-meta">
            <div className="about-name">Yui</div>
            <div className="about-version">
              {t("settings.about.version", { version: state?.currentVersion ?? "" })}
            </div>
            <div className="about-tagline">
              {t("settings.about.taglineBefore")}
              <a href={AUTHOR_URL} target="_blank" rel="noreferrer">
                ACAne
              </a>
              {t("settings.about.taglineAfter")}
            </div>
          </div>
        </div>
      </SetGroup>

      <SetGroup title={t("settings.about.updates")}>
        <div className="set-row">
          <div className="sr-text">
            <div className="sr-label about-status">
              <span
                className="about-status-dot"
                data-on={hasUpdate}
                data-error={phase === "error"}
                aria-hidden="true"
              />
              {status}
            </div>
            {phase === "error" && state?.error ? (
              <div className="sr-desc">{state.error}</div>
            ) : null}
            {phase === "downloading" ? (
              <div className="about-progress" role="progressbar" aria-valuenow={percent}>
                <div className="about-progress-bar" style={{ width: `${percent}%` }} />
              </div>
            ) : null}
          </div>
          <div className="sr-control about-actions">
            {hasUpdate ? (
              <button type="button" className="primary-button" onClick={() => setUpdateOpen(true)}>
                <Icon name={phase === "downloaded" ? "refresh" : "download"} size={14} />
                {t("settings.about.viewUpdate")}
              </button>
            ) : null}
            <button
              type="button"
              className="outline-button"
              disabled={!supported || checking}
              onClick={check}
            >
              {checking ? t("settings.about.checking") : t("settings.about.check")}
            </button>
          </div>
        </div>
      </SetGroup>

      <SetGroup title={t("settings.about.links")}>
        <div className="set-row">
          <div className="sr-text">
            <div className="sr-label">{t("settings.about.sourceCode")}</div>
          </div>
          <div className="sr-control">
            <a className="outline-button" href={REPO_URL} target="_blank" rel="noreferrer">
              {t("settings.about.github")}
            </a>
          </div>
        </div>
        <div className="set-row">
          <div className="sr-text">
            <div className="sr-label">{t("settings.about.releaseHistory")}</div>
          </div>
          <div className="sr-control">
            <a
              className="outline-button"
              href={`${REPO_URL}/releases`}
              target="_blank"
              rel="noreferrer"
            >
              {t("settings.about.releases")}
            </a>
          </div>
        </div>
        <div className="set-row">
          <div className="sr-text">
            <div className="sr-label">{t("settings.about.license")}</div>
          </div>
          <div className="sr-control">
            <a
              className="outline-button"
              href={`${REPO_URL}/blob/main/LICENSE`}
              target="_blank"
              rel="noreferrer"
            >
              MIT
            </a>
          </div>
        </div>
      </SetGroup>
    </div>
  );
}
