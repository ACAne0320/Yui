// Settings UI over the global Pi extension sources. Extensions are code, so
// there is no form editor: the panel shows what pi's discovery would load
// (with probe-derived tools/commands/errors) from every global source —
// the extensions directory (file management + Yui's disable-by-moving),
// settings.json `extensions` paths (list management, files untouched), and
// settings.json `packages` (read-only; installed via the pi CLI). Changes
// apply to conversations opened afterwards.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ExtensionCatalogEntry } from "@yui/contracts";
import {
  useAddExtensionPath,
  useDeleteExtension,
  useExtensionCatalog,
  useRemoveExtensionPath,
  useSetExtensionEnabled,
} from "@renderer/data/extensions";
import { api } from "@renderer/lib/api";
import { formatError } from "@renderer/lib/format";
import { ConfirmDialog } from "@renderer/ui/ConfirmDialog";
import { Icon } from "@renderer/ui/Icon";
import { Toggle } from "@renderer/ui/Toggle";

/** Entries can share a basename across sources; key them by both. */
const keyOf = (entry: ExtensionCatalogEntry) => `${entry.source}:${entry.name}`;

export function ExtensionsPanel() {
  const { t } = useTranslation();
  const catalogQuery = useExtensionCatalog();
  const addPath = useAddExtensionPath();
  const entries = catalogQuery.data?.entries ?? [];
  const packages = catalogQuery.data?.packages ?? [];
  const directory = catalogQuery.data?.directory;
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [pathDraft, setPathDraft] = useState("");
  const [pathError, setPathError] = useState<string | null>(null);

  const directoryEntries = entries.filter((entry) => entry.source === "directory");
  const settingsEntries = entries.filter((entry) => entry.source === "settings");
  const selected = entries.find((entry) => keyOf(entry) === selectedKey) ?? entries[0];

  const submitPath = async () => {
    const path = pathDraft.trim();
    if (!path) return;
    setPathError(null);
    try {
      await addPath.mutateAsync({ path });
      setPathDraft("");
    } catch (error) {
      setPathError(formatError(error));
    }
  };

  const entryButton = (entry: ExtensionCatalogEntry) => (
    <button
      key={keyOf(entry)}
      data-active={selected !== undefined && keyOf(entry) === keyOf(selected)}
      onClick={() => setSelectedKey(keyOf(entry))}
    >
      <span className="provider-logo">
        <Icon name="puzzle" size={16} />
      </span>
      <span>
        <strong>{entry.name}</strong>
        <small>{entrySummary(entry, t)}</small>
      </span>
      {entry.source === "directory" && <Toggle on={entry.enabled} label={entry.name} small />}
    </button>
  );

  return (
    <div className="provider-layout">
      <div className="provider-list extension-source-list scroll">
        <div className="subagent-toolbar">
          <button
            className="outline-button"
            onClick={() => directory && void api.desktop.openPath({ path: directory })}
            disabled={!directory}
          >
            <Icon name="folder" size={14} />
            {t("settings.extensions.openDirectory")}
          </button>
        </div>
        {entries.length === 0 && packages.length === 0 && <p>{t("settings.extensions.empty")}</p>}
        {directoryEntries.length > 0 && <p>{t("settings.extensions.directoryGroup")}</p>}
        {directoryEntries.map(entryButton)}
        <p>{t("settings.extensions.settingsGroup")}</p>
        {settingsEntries.map(entryButton)}
        <form
          className="extension-add-path"
          onSubmit={(event) => {
            event.preventDefault();
            void submitPath();
          }}
        >
          <input
            type="text"
            value={pathDraft}
            placeholder={t("settings.extensions.addPathPlaceholder")}
            onChange={(event) => {
              setPathDraft(event.target.value);
              setPathError(null);
            }}
          />
          <button
            type="submit"
            className="outline-button"
            disabled={!pathDraft.trim() || addPath.isPending}
          >
            {t("settings.extensions.addPath")}
          </button>
        </form>
        {pathError && <div className="field-error">{pathError}</div>}
        {packages.length > 0 && (
          <>
            <p>{t("settings.extensions.packagesGroup")}</p>
            {packages.map((pkg) => (
              <div key={pkg.source} className="extension-package-row">
                <Icon name="db" size={14} />
                <span>{pkg.source}</span>
                {pkg.filtered && <em>{t("settings.extensions.packageFiltered")}</em>}
              </div>
            ))}
            <div className="field-hint">{t("settings.extensions.packagesHint")}</div>
          </>
        )}
      </div>
      <div className="provider-detail scroll">
        {selected ? (
          <ExtensionDetail
            key={keyOf(selected)}
            entry={selected}
            onRemoved={() => setSelectedKey(null)}
          />
        ) : (
          <div className="empty-provider">{t("settings.extensions.emptyDetail")}</div>
        )}
      </div>
    </div>
  );
}

function entrySummary(
  entry: ExtensionCatalogEntry,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (!entry.enabled) return t("settings.extensions.disabled");
  if (entry.error) return t("settings.extensions.loadFailed");
  return t("settings.extensions.summary", {
    tools: entry.tools.length,
    commands: entry.commands.length,
  });
}

function ExtensionDetail({
  entry,
  onRemoved,
}: {
  entry: ExtensionCatalogEntry;
  onRemoved: () => void;
}) {
  const { t } = useTranslation();
  const setEnabled = useSetExtensionEnabled();
  const remove = useDeleteExtension();
  const removePath = useRemoveExtensionPath();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const fromSettings = entry.source === "settings";
  const removeLabel = fromSettings
    ? t("settings.extensions.removePath")
    : t("settings.extensions.delete");

  const toggle = async () => {
    setFeedback(null);
    try {
      await setEnabled.mutateAsync({ name: entry.name, enabled: !entry.enabled });
    } catch (error) {
      setFeedback(formatError(error));
    }
  };

  const confirmRemove = async () => {
    setConfirmOpen(false);
    try {
      if (fromSettings) {
        await removePath.mutateAsync({ path: entry.name });
      } else {
        await remove.mutateAsync({ name: entry.name });
      }
      onRemoved();
    } catch (error) {
      setFeedback(formatError(error));
    }
  };

  const statusKey = !entry.enabled ? "disabled" : entry.error ? "loadFailed" : "enabled";

  return (
    <div className="extension-detail">
      <div className="provider-head">
        <div>
          <h3>{entry.name}</h3>
          <p>
            {fromSettings
              ? t("settings.extensions.kindSettingsPath")
              : entry.kind === "directory"
                ? t("settings.extensions.kindPackage")
                : t("settings.extensions.kindFile")}
          </p>
          <code className="extension-path" title={entry.path}>
            {entry.path}
          </code>
        </div>
        <span className={`status-pill ${statusKey === "enabled" ? "ready" : "missing"}`}>
          {t(`settings.extensions.${statusKey}`)}
        </span>
      </div>

      {entry.error && (
        <div className="settings-section">
          <label>{t("settings.extensions.error")}</label>
          <pre className="extension-error">{entry.error}</pre>
        </div>
      )}

      {entry.enabled && !entry.error && entry.tools.length === 0 && entry.commands.length === 0 && (
        <div className="settings-section">
          <div className="field-hint">{t("settings.extensions.noRegistrations")}</div>
        </div>
      )}

      {entry.enabled && !entry.error && (entry.tools.length > 0 || entry.commands.length > 0) && (
        <>
          <div className="settings-section">
            <label>{t("settings.extensions.tools")}</label>
            {entry.tools.length > 0 ? (
              <ul className="extension-items">
                {entry.tools.map((tool) => (
                  <li key={tool.name}>
                    <strong>{tool.name}</strong>
                    {tool.description && <span>{tool.description}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="field-hint">{t("settings.extensions.noTools")}</div>
            )}
          </div>
          <div className="settings-section">
            <label>{t("settings.extensions.commands")}</label>
            {entry.commands.length > 0 ? (
              <ul className="extension-items">
                {entry.commands.map((command) => (
                  <li key={command.name}>
                    <strong>/{command.name}</strong>
                    {command.description && <span>{command.description}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="field-hint">{t("settings.extensions.noCommands")}</div>
            )}
          </div>
        </>
      )}

      <div className="subagent-form-actions">
        {!fromSettings && (
          <button
            type="button"
            className="outline-button"
            disabled={setEnabled.isPending}
            onClick={() => void toggle()}
          >
            {entry.enabled ? t("settings.extensions.disable") : t("settings.extensions.enable")}
          </button>
        )}
        <button
          type="button"
          className="danger-button"
          disabled={remove.isPending || removePath.isPending}
          onClick={() => setConfirmOpen(true)}
        >
          {removeLabel}
        </button>
        {feedback && <span className="field-hint">{feedback}</span>}
      </div>
      <div className="field-hint">{t("settings.extensions.appliesToNewSessions")}</div>

      <ConfirmDialog
        open={confirmOpen}
        title={removeLabel}
        message={
          fromSettings
            ? t("settings.extensions.removePathConfirm", { name: entry.name })
            : t("settings.extensions.deleteConfirm", { name: entry.name })
        }
        confirmLabel={removeLabel}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
