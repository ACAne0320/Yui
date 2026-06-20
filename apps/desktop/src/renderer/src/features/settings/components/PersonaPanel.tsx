import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  usePersonaConfig,
  useSaveSoul,
  useSetPersonaConfig,
  useSoul,
} from "@renderer/data/persona";
import { formatError } from "@renderer/lib/format";
import { Icon } from "@renderer/ui/Icon";
import { useChatStore } from "../../chat/store";
import { MemoryManager } from "./MemoryManager";

type Feedback = { kind: "success" | "error"; text: string };

export function PersonaPanel() {
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

  const personaConfig = usePersonaConfig();
  const setPersonaConfig = useSetPersonaConfig();
  const memoryEnabled = personaConfig.data?.memoryEnabled ?? true;
  const activeCwd = useChatStore((store) => store.active?.cwd);

  return (
    <div className="panel-scroll scroll persona-panel">
      <div className="provider-head">
        <div className="provider-head-logo">
          <Icon name="spark" size={20} />
        </div>
        <div>
          <h3>{t("settings.persona.soulTitle")}</h3>
          <p>{t("settings.persona.soulDescription")}</p>
        </div>
      </div>

      <div className="settings-section persona-editor">
        <div className="persona-editor-head">
          <label htmlFor="persona-soul">{t("settings.persona.soulLabel")}</label>
          <span className="persona-char-count">
            {t("settings.persona.charCount", { n: content.length })}
          </span>
        </div>
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
      </div>

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
        {activeCwd ? (
          <MemoryManager
            scope="cwd"
            cwd={activeCwd}
            title={t("settings.persona.memory.projectTitle")}
          />
        ) : (
          <div className="memory-empty">{t("settings.persona.memory.noProject")}</div>
        )}
      </div>
    </div>
  );
}
