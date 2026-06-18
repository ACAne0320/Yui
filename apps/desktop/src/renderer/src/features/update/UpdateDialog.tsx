import { useTranslation } from "react-i18next";
import { useUiStore } from "@renderer/stores/ui-store";
import { useUpdateStore } from "@renderer/stores/update-store";
import { Icon } from "@renderer/ui/Icon";
import { Markdown } from "@renderer/ui/Markdown";

/**
 * The "what's new + install" modal opened from the sidebar update button. The
 * primary action follows the main-process update phase: download → (progress)
 * → restart & install. Errors fall back to a retry of whichever step failed.
 */
export function UpdateDialog() {
  const { t } = useTranslation();
  const state = useUpdateStore((store) => store.state);
  const download = useUpdateStore((store) => store.download);
  const install = useUpdateStore((store) => store.install);
  const setUpdateOpen = useUiStore((store) => store.setUpdateOpen);

  const latest = state?.latest;
  // The dialog is only meaningful once a concrete release is known.
  if (!state || !latest) {
    return null;
  }

  const close = () => setUpdateOpen(false);
  const percent = Math.round((state.downloadProgress ?? 0) * 100);

  const primaryAction =
    state.phase === "downloaded"
      ? { label: t("update.actions.install"), onClick: install, disabled: false }
      : state.phase === "downloading"
        ? { label: t("update.actions.downloading", { percent }), onClick: () => {}, disabled: true }
        : { label: t("update.actions.download"), onClick: download, disabled: false };

  return (
    <div
      className="confirm-overlay"
      onKeyDown={(event) => {
        if (event.key === "Escape") close();
      }}
    >
      <div className="update-dialog" role="dialog" aria-modal="true" aria-label={t("update.title")}>
        <header className="update-head">
          <div>
            <span className="update-eyebrow">{t("update.eyebrow")}</span>
            <h3>{t("update.title")}</h3>
          </div>
          <button className="update-close" onClick={close} aria-label={t("common.actions.close")}>
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="update-version">
          <span className="update-version-current">v{state.currentVersion}</span>
          <span className="update-arrow" aria-hidden="true">
            →
          </span>
          <span className="update-version-next">v{latest.version}</span>
        </div>

        <div className="update-changelog">
          <Markdown>{latest.notes || t("update.noNotes")}</Markdown>
        </div>

        {state.phase === "downloading" && (
          <div className="update-progress" role="progressbar" aria-valuenow={percent}>
            <div className="update-progress-bar" style={{ width: `${percent}%` }} />
          </div>
        )}

        {state.phase === "error" && state.error && <p className="update-error">{state.error}</p>}

        <footer className="update-actions">
          <a className="outline-button" href={latest.url} target="_blank" rel="noreferrer">
            {t("update.actions.viewOnGitHub")}
          </a>
          <button
            type="button"
            className="primary-button"
            disabled={primaryAction.disabled}
            onClick={primaryAction.onClick}
          >
            {state.phase !== "downloading" && (
              <Icon name={state.phase === "downloaded" ? "refresh" : "download"} size={14} />
            )}
            {primaryAction.label}
          </button>
        </footer>
      </div>
    </div>
  );
}
