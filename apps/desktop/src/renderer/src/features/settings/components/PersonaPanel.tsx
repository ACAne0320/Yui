import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useMemoryProjects,
  usePersonaConfig,
  useSaveSoul,
  useSetPersonaConfig,
  useSoul,
} from "@renderer/data/persona";
import { formatError, shortPath } from "@renderer/lib/format";
import { Icon } from "@renderer/ui/Icon";
import { Popover } from "@renderer/ui/Popover";
import { Segmented } from "@renderer/ui/Segmented";
import { useChatStore } from "../../chat/store";
import { MemoryManager } from "./MemoryManager";

type Feedback = { kind: "success" | "error"; text: string };
type PersonaTab = "identity" | "memory";

export function PersonaPanel() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<PersonaTab>("identity");

  return (
    <div className="panel-scroll scroll persona-panel">
      <div className="persona-tabs">
        <Segmented
          asTabs
          value={tab}
          onChange={setTab}
          options={(["identity", "memory"] as const).map((id) => ({
            value: id,
            label: t(`settings.persona.tabs.${id}`),
          }))}
        />
      </div>

      <div key={tab} className="persona-tab-panel">
        {tab === "identity" ? <IdentityTab /> : <MemoryTab />}
      </div>
    </div>
  );
}

function IdentityTab() {
  const { t } = useTranslation();
  const soulQuery = useSoul();
  const saveSoul = useSaveSoul();
  const [content, setContent] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  useEffect(() => {
    if (soulQuery.data) {
      setContent(soulQuery.data.content);
      setFeedback(null);
    }
  }, [soulQuery.data?.content]);

  const savedContent = soulQuery.data?.content ?? "";
  const dirty = content !== savedContent;

  const save = async () => {
    setFeedback(null);
    try {
      const saved = await saveSoul.mutateAsync({ content });
      setContent(saved.content);
      setFeedback({ kind: "success", text: t("settings.persona.saved") });
    } catch (error) {
      setFeedback({ kind: "error", text: formatError(error) });
    }
  };

  const loadError = soulQuery.isError && !feedback ? formatError(soulQuery.error) : null;
  const status: Feedback | null =
    feedback ?? (loadError ? { kind: "error", text: loadError } : null);

  return (
    <div className="settings-section persona-editor">
      <div className="persona-editor-head">
        <label htmlFor="persona-soul">{t("settings.persona.soulLabel")}</label>
        <span className="persona-char-count">
          {t("settings.persona.charCount", { n: content.length })}
        </span>
      </div>
      <p className="persona-tab-desc">{t("settings.persona.soulDescription")}</p>
      <textarea
        id="persona-soul"
        value={content}
        placeholder={t("settings.persona.soulPlaceholder")}
        spellCheck={false}
        onChange={(event) => {
          setContent(event.target.value);
          setFeedback(null);
        }}
      />
      <div className="field-hint">{t("settings.persona.appliesToNewSessions")}</div>

      <div className="persona-actions">
        <button
          type="button"
          className="primary-button"
          disabled={!dirty || saveSoul.isPending}
          onClick={() => void save()}
        >
          <Icon name="check" size={14} />
          {saveSoul.isPending ? t("settings.persona.saving") : t("settings.persona.save")}
        </button>
        {status ? (
          <span className="persona-status" data-kind={status.kind}>
            <span className="persona-status-dot" aria-hidden="true" />
            {status.text}
          </span>
        ) : dirty ? (
          <span className="persona-status" data-kind="dirty">
            {t("settings.persona.unsaved")}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function MemoryTab() {
  const { t } = useTranslation();
  const personaConfig = usePersonaConfig();
  const setPersonaConfig = useSetPersonaConfig();
  const memoryEnabled = personaConfig.data?.memoryEnabled ?? true;
  const activeCwd = useChatStore((store) => store.active?.cwd);
  const projects = useMemoryProjects();

  // Every cwd that has project memory, plus the active conversation's cwd (so
  // its memory is reachable even before it has any entries yet), sorted stably.
  const cwds = useMemo(() => {
    const set = new Set<string>();
    if (activeCwd) set.add(activeCwd);
    for (const project of projects.data ?? []) set.add(project.cwd);
    return [...set].toSorted((a, b) => a.localeCompare(b));
  }, [activeCwd, projects.data]);

  // Default to the active cwd; an explicit pick overrides until it leaves the list.
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const selectedCwd =
    (picked && cwds.includes(picked) ? picked : undefined) ?? activeCwd ?? cwds[0];
  const countFor = (cwd: string) =>
    projects.data?.find((project) => project.cwd === cwd)?.count ?? 0;

  return (
    <div className="settings-section persona-memory">
      <div className="set-row">
        <div className="sr-text">
          <div className="sr-label">{t("settings.persona.memory.toggle")}</div>
          <div className="sr-desc">{t("settings.persona.memory.toggleDescription")}</div>
        </div>
        <div className="sr-control">
          <button
            type="button"
            className="mini-toggle"
            role="switch"
            aria-checked={memoryEnabled}
            data-on={memoryEnabled}
            disabled={setPersonaConfig.isPending}
            onClick={() => setPersonaConfig.mutate({ memoryEnabled: !memoryEnabled })}
          />
        </div>
      </div>

      <MemoryManager scope="global" title={t("settings.persona.memory.globalTitle")} />
      {selectedCwd ? (
        <MemoryManager
          // Remount on cwd change so a half-open editor doesn't carry across.
          key={selectedCwd}
          scope="cwd"
          cwd={selectedCwd}
          title={
            <Popover
              trigger={
                <button type="button" className="memory-cwd-switch">
                  <span>{t("settings.persona.memory.projectTitle")}</span>
                  <Icon name="folder" size={12} />
                  <span className="memory-cwd-path">{shortPath(selectedCwd)}</span>
                  <Icon name="chevron" size={11} />
                </button>
              }
            >
              <div className="popover-title">{t("settings.persona.memory.projectTitle")}</div>
              {cwds.map((cwd) => (
                <button
                  key={cwd}
                  type="button"
                  className="popover-item"
                  data-active={cwd === selectedCwd}
                  onClick={() => setPicked(cwd)}
                >
                  <Icon name="folder" size={14} />
                  <span>{shortPath(cwd)}</span>
                  {countFor(cwd) > 0 && <span className="memory-cwd-count">{countFor(cwd)}</span>}
                </button>
              ))}
            </Popover>
          }
        />
      ) : (
        <div className="memory-empty">{t("settings.persona.memory.noProject")}</div>
      )}
    </div>
  );
}
