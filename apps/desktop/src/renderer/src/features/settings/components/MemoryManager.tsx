import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { MemoryScope } from "@yui/contracts";
import { useDeleteMemory, useMemoryEntries, useSaveMemory } from "@renderer/data/persona";
import { formatError } from "@renderer/lib/format";
import { Icon } from "@renderer/ui/Icon";

const cut = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** Mirror the runtime's name/description derivation for user-edited entries. */
function deriveFields(content: string): { name: string; description: string } {
  const collapsed = content.replaceAll(/\s+/g, " ").trim();
  const first = (content.split(/\r?\n/).find((line) => line.trim()) ?? collapsed).trim();
  return { name: cut(first, 80), description: cut(collapsed, 140) };
}

export function MemoryManager({
  scope,
  cwd,
  title,
}: {
  scope: MemoryScope;
  cwd?: string;
  title: string;
}) {
  const { t } = useTranslation();
  const entries = useMemoryEntries(scope, cwd);
  const save = useSaveMemory();
  const del = useDeleteMemory();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const list = entries.data ?? [];
  const open = (slug: string, content: string) => {
    setEditing(slug);
    setDraft(content);
    setError(null);
  };
  const close = () => {
    setEditing(null);
    setDraft("");
    setError(null);
  };

  const submit = async () => {
    const content = draft.trim();
    if (!content) return;
    const { name, description } = deriveFields(content);
    try {
      await save.mutateAsync({
        scope,
        cwd,
        slug: editing && editing !== "new" ? editing : undefined,
        name,
        description,
        content,
      });
      close();
    } catch (caught) {
      setError(formatError(caught));
    }
  };

  const editor = (
    <div className="memory-editor">
      <textarea
        value={draft}
        placeholder={t("settings.persona.memory.placeholder")}
        spellCheck={false}
        onChange={(event) => setDraft(event.target.value)}
      />
      {error && <div className="field-error">{error}</div>}
      <div className="memory-editor-actions">
        <button
          type="button"
          className="primary-button"
          disabled={!draft.trim() || save.isPending}
          onClick={() => void submit()}
        >
          {t("settings.persona.memory.saveEntry")}
        </button>
        <button type="button" className="outline-button" onClick={close}>
          {t("settings.persona.memory.cancel")}
        </button>
      </div>
    </div>
  );

  return (
    <div className="memory-manager">
      <div className="memory-manager-head">
        <span className="memory-manager-title">{title}</span>
        <button
          type="button"
          className="outline-button"
          disabled={editing === "new"}
          onClick={() => open("new", "")}
        >
          <Icon name="plus" size={13} />
          {t("settings.persona.memory.add")}
        </button>
      </div>

      {editing === "new" && editor}

      {list.length === 0 && editing !== "new" ? (
        <div className="memory-empty">{t("settings.persona.memory.empty")}</div>
      ) : (
        <ul className="memory-list">
          {list.map((entry) => (
            <li key={entry.slug} className="memory-item">
              {editing === entry.slug ? (
                editor
              ) : (
                <>
                  <div className="memory-item-text">
                    <span className="memory-item-name">{entry.name}</span>
                    {entry.description && entry.description !== entry.name && (
                      <span className="memory-item-desc">{entry.description}</span>
                    )}
                  </div>
                  <div className="memory-item-actions">
                    <button
                      type="button"
                      title={t("settings.persona.memory.edit")}
                      onClick={() => open(entry.slug, entry.content || entry.description)}
                    >
                      <Icon name="edit" size={13} />
                    </button>
                    <button
                      type="button"
                      title={t("settings.persona.memory.delete")}
                      disabled={del.isPending}
                      onClick={() => del.mutate({ scope, cwd, slug: entry.slug })}
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
