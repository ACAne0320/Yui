import { type ReactNode, useEffect, useRef, useState } from "react";
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

/**
 * Focused add/edit surface. A modal (rather than an inline editor spliced into
 * the list) gives the textarea room and keeps the list layout stable.
 * Cmd/Ctrl+Enter saves; Escape cancels.
 */
function MemoryEditorDialog({
  open,
  title,
  value,
  error,
  pending,
  onChange,
  onSubmit,
  onCancel,
}: {
  open: boolean;
  title: string;
  value: string;
  error: string | null;
  pending: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);
  if (!open) return null;

  return (
    <div
      className="confirm-overlay"
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel();
      }}
    >
      <div
        className="confirm-dialog memory-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <h3>{title}</h3>
        <textarea
          ref={ref}
          value={value}
          placeholder={t("settings.persona.memory.placeholder")}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              onSubmit();
            }
          }}
        />
        {error && <div className="field-error">{error}</div>}
        <div className="confirm-actions">
          <button type="button" className="outline-button" onClick={onCancel}>
            {t("settings.persona.memory.cancel")}
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={!value.trim() || pending}
            onClick={onSubmit}
          >
            {t("settings.persona.memory.saveEntry")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function MemoryManager({
  scope,
  cwd,
  title,
}: {
  scope: MemoryScope;
  cwd?: string;
  /** Plain text for global memory; the project section passes a cwd switcher. */
  title: ReactNode;
}) {
  const { t } = useTranslation();
  const entries = useMemoryEntries(scope, cwd);
  const save = useSaveMemory();
  const del = useDeleteMemory();
  // `null` closed, `"new"` adding, otherwise the slug being edited.
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

  return (
    <div className="memory-manager">
      <div className="memory-manager-head">
        <span className="memory-manager-title">{title}</span>
        <button type="button" className="outline-button" onClick={() => open("new", "")}>
          <Icon name="plus" size={13} />
          {t("settings.persona.memory.add")}
        </button>
      </div>

      {list.length === 0 ? (
        <div className="memory-empty">{t("settings.persona.memory.empty")}</div>
      ) : (
        <ul className="memory-list">
          {list.map((entry) => (
            <li key={entry.slug} className="memory-item">
              {/* `description` is the whole memory collapsed and `name` its first
                  line, so they restate each other; show one preview. */}
              <div className="memory-item-text">{entry.description || entry.name}</div>
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
                  className="memory-delete"
                  title={t("settings.persona.memory.delete")}
                  disabled={del.isPending}
                  onClick={() => del.mutate({ scope, cwd, slug: entry.slug })}
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <MemoryEditorDialog
        open={editing !== null}
        title={t(
          editing === "new" ? "settings.persona.memory.add" : "settings.persona.memory.edit",
        )}
        value={draft}
        error={error}
        pending={save.isPending}
        onChange={setDraft}
        onSubmit={() => void submit()}
        onCancel={close}
      />
    </div>
  );
}
