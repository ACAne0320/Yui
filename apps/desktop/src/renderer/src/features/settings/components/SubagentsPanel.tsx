// Settings UI over the named-subagent files (`<agentDir>/agents/*.md`). The
// files stay the source of truth — this panel is a manager, not a separate
// store. Builtin roles can be customized (saving writes an override file) and
// reset (deleting the file restores the code-defined default).

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { AppModel, SubagentConfig } from "@yui/contracts";
import { useModels } from "@renderer/data/models";
import { useDeleteSubagent, useSaveSubagent, useSubagents } from "@renderer/data/subagents";
import { formatError } from "@renderer/lib/format";
import { ConfirmDialog } from "@renderer/ui/ConfirmDialog";
import { Icon } from "@renderer/ui/Icon";

/** Must match the contracts-side `subagentNameSchema`. */
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/** Agent names are stored lowercase (model-facing); display them capitalized. */
function displayName(name: string): string {
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : name;
}

export function SubagentsPanel() {
  const { t } = useTranslation();
  const catalogQuery = useSubagents();
  const modelsQuery = useModels();
  const agents = catalogQuery.data?.agents ?? [];
  const availableTools = catalogQuery.data?.availableTools ?? [];
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const selected = creating
    ? undefined
    : (agents.find((agent) => agent.name === selectedName) ?? agents[0]);

  return (
    <div className="provider-layout">
      <div className="provider-list scroll">
        <div className="subagent-toolbar">
          <button
            className="outline-button"
            onClick={() => {
              setCreating(true);
              setSelectedName(null);
            }}
          >
            <Icon name="plus" size={14} />
            {t("settings.subagents.add")}
          </button>
        </div>
        {agents.map((agent) => (
          <button
            key={agent.name}
            data-active={!creating && agent.name === selected?.name}
            onClick={() => {
              setCreating(false);
              setSelectedName(agent.name);
            }}
          >
            <span className="provider-logo">
              <Icon name="chat" size={16} />
            </span>
            <span>
              <strong>{displayName(agent.name)}</strong>
              <small>
                {agent.builtin
                  ? agent.hasFile
                    ? t("settings.subagents.customized")
                    : t("settings.subagents.builtin")
                  : t("settings.subagents.custom")}
              </small>
            </span>
          </button>
        ))}
      </div>
      <div className="provider-detail scroll">
        <SubagentEditor
          // Remount on selection change so the form re-seeds its defaults.
          key={creating ? "::new" : (selected?.name ?? "::empty")}
          agent={creating ? undefined : selected}
          models={modelsQuery.data ?? []}
          availableTools={availableTools}
          onSaved={(name) => {
            setCreating(false);
            setSelectedName(name);
          }}
          onDeleted={() => {
            setCreating(false);
            setSelectedName(null);
          }}
        />
      </div>
    </div>
  );
}

interface SubagentFormValues {
  name: string;
  description: string;
  model: string;
  tools: string[];
  systemPrompt: string;
}

function SubagentEditor({
  agent,
  models,
  availableTools,
  onSaved,
  onDeleted,
}: {
  agent?: SubagentConfig;
  models: AppModel[];
  availableTools: string[];
  onSaved: (name: string) => void;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const save = useSaveSubagent();
  const remove = useDeleteSubagent();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restrictTools, setRestrictTools] = useState(Boolean(agent?.tools));
  const form = useForm<SubagentFormValues>({
    defaultValues: {
      name: agent?.name ?? "",
      description: agent?.description ?? "",
      model: agent?.model ?? "",
      tools: agent?.tools ?? [],
      systemPrompt: agent?.systemPrompt ?? "",
    },
  });
  const errors = form.formState.errors;

  // Offer the runtime's toolset plus any names the file already mentions
  // (extensions can register extra tools), so a save never drops them.
  const toolOptions = [
    ...availableTools,
    ...(agent?.tools ?? []).filter((tool) => !availableTools.includes(tool)),
  ];

  // The picker lists authorized models; an agent may reference one that no
  // longer is (auth removed, registry change). Keep it selectable so opening
  // the editor never silently rewrites the agent, and warn instead.
  const savedModel = agent?.model ?? "";
  const savedModelListed = !savedModel || models.some(modelMatchesSaved(savedModel));
  const savedModelKnown =
    !savedModel ||
    models.some((model) => `${model.providerId}/${model.modelId}` === savedModel) ||
    models.some((model) => model.modelId === savedModel);

  const submit = form.handleSubmit(async (values) => {
    setFeedback(null);
    const name = values.name.trim();
    const tools = Array.isArray(values.tools) ? values.tools : [];
    if (restrictTools && tools.length === 0) {
      form.setError("tools", { type: "validate" });
      return;
    }
    try {
      await save.mutateAsync({
        name,
        description: values.description.trim(),
        systemPrompt: values.systemPrompt,
        tools: restrictTools ? tools : undefined,
        model: values.model.trim() || undefined,
        // Renaming only applies to file-backed agents; builtin names are fixed.
        previousName: agent && agent.hasFile && agent.name !== name ? agent.name : undefined,
      });
      setFeedback(t("settings.subagents.saved"));
      onSaved(name);
    } catch (error) {
      setFeedback(formatError(error));
    }
  });

  const deleteLabel = agent?.builtin
    ? t("settings.subagents.reset")
    : t("settings.subagents.delete");
  const confirmDelete = async () => {
    setConfirmOpen(false);
    if (!agent) return;
    try {
      await remove.mutateAsync({ name: agent.name });
      onDeleted();
    } catch (error) {
      setFeedback(formatError(error));
    }
  };

  return (
    <form className="subagent-form" onSubmit={(event) => void submit(event)}>
      <div className="provider-head">
        <div>
          <h3>{agent ? displayName(agent.name) : t("settings.subagents.newAgent")}</h3>
          <p>
            {agent?.builtin
              ? t("settings.subagents.builtinNote")
              : t("settings.subagents.customNote")}
          </p>
        </div>
        {agent?.builtin && (
          <span className={`status-pill ${agent.hasFile ? "missing" : "ready"}`}>
            {agent.hasFile ? t("settings.subagents.customized") : t("settings.subagents.builtin")}
          </span>
        )}
      </div>

      <div className="settings-section">
        <label htmlFor="subagent-name">{t("settings.subagents.name")}</label>
        <input
          id="subagent-name"
          type="text"
          disabled={agent?.builtin}
          placeholder="code-reviewer"
          {...form.register("name", {
            required: true,
            pattern: NAME_PATTERN,
            onChange: () => setFeedback(null),
          })}
        />
        {errors.name && <div className="field-error">{t("settings.subagents.nameInvalid")}</div>}
      </div>

      <div className="settings-section">
        <label htmlFor="subagent-description">{t("settings.subagents.description")}</label>
        <input
          id="subagent-description"
          type="text"
          placeholder={t("settings.subagents.descriptionPlaceholder")}
          {...form.register("description", { required: true, onChange: () => setFeedback(null) })}
        />
        {errors.description && (
          <div className="field-error">{t("settings.subagents.descriptionRequired")}</div>
        )}
        <div className="field-hint">{t("settings.subagents.descriptionHint")}</div>
      </div>

      <div className="settings-section">
        <label htmlFor="subagent-model">{t("settings.subagents.model")}</label>
        <select id="subagent-model" {...form.register("model")}>
          <option value="">{t("settings.subagents.modelDefault")}</option>
          {models.map((model) => {
            const value = `${model.providerId}/${model.modelId}`;
            return (
              <option key={value} value={value}>
                {model.name} ({model.providerId})
              </option>
            );
          })}
          {!savedModelListed && (
            <option value={savedModel}>
              {savedModelKnown
                ? savedModel
                : `${savedModel} — ${t("settings.subagents.modelUnavailable")}`}
            </option>
          )}
        </select>
        {!savedModelKnown && (
          <div className="field-error">{t("settings.subagents.modelUnavailableHint")}</div>
        )}
      </div>

      <div className="settings-section">
        <label>{t("settings.subagents.tools")}</label>
        <div className="segmented">
          <button type="button" data-on={!restrictTools} onClick={() => setRestrictTools(false)}>
            {t("settings.subagents.toolsAll")}
          </button>
          <button type="button" data-on={restrictTools} onClick={() => setRestrictTools(true)}>
            {t("settings.subagents.toolsCustom")}
          </button>
        </div>
        {restrictTools && (
          <>
            <div className="tool-checks">
              {toolOptions.map((tool) => (
                <label key={tool} className="tool-check">
                  <input
                    type="checkbox"
                    value={tool}
                    {...form.register("tools", { onChange: () => form.clearErrors("tools") })}
                  />
                  <span>{tool}</span>
                </label>
              ))}
            </div>
            {errors.tools && (
              <div className="field-error">{t("settings.subagents.toolsRequired")}</div>
            )}
          </>
        )}
        <div className="field-hint">
          {restrictTools
            ? t("settings.subagents.toolsCustomHint")
            : t("settings.subagents.toolsAllHint")}
        </div>
      </div>

      <div className="settings-section">
        <label htmlFor="subagent-prompt">{t("settings.subagents.systemPrompt")}</label>
        <textarea
          id="subagent-prompt"
          rows={10}
          placeholder={t("settings.subagents.systemPromptPlaceholder")}
          {...form.register("systemPrompt")}
        />
      </div>

      <div className="subagent-form-actions">
        <button type="submit" className="outline-button" disabled={save.isPending}>
          {t("settings.subagents.save")}
        </button>
        {agent?.hasFile && (
          <button
            type="button"
            className="danger-button"
            disabled={remove.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            {deleteLabel}
          </button>
        )}
        {feedback && <span className="field-hint">{feedback}</span>}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={deleteLabel}
        message={
          agent?.builtin
            ? t("settings.subagents.resetConfirm", { name: displayName(agent.name) })
            : t("settings.subagents.deleteConfirm", { name: displayName(agent?.name ?? "") })
        }
        confirmLabel={deleteLabel}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setConfirmOpen(false)}
      />
    </form>
  );
}

function modelMatchesSaved(saved: string): (model: AppModel) => boolean {
  return (model) => `${model.providerId}/${model.modelId}` === saved;
}
