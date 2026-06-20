import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { MemoryEntry } from "@yui/contracts";
import { useDeleteMemory } from "@renderer/data/persona";
import { Icon } from "@renderer/ui/Icon";

interface Remembered {
  entry: MemoryEntry;
  updated: boolean;
}

/** Pull the structured `remember` result off a tool detail, if present. */
export function rememberedFrom(detail: unknown): Remembered | undefined {
  const details = (detail as { details?: unknown })?.details;
  if (!details || typeof details !== "object") return undefined;
  const entry = (details as { entry?: unknown }).entry;
  if (!entry || typeof entry !== "object" || typeof (entry as MemoryEntry).slug !== "string") {
    return undefined;
  }
  return {
    entry: entry as MemoryEntry,
    updated: Boolean((details as { updated?: unknown }).updated),
  };
}

/**
 * Non-blocking "remembered" card shown inline in the chat when the model saves
 * a memory. Reviewable: the user can delete the entry straight from the card
 * (an undo for an unwanted memory) without leaving the conversation.
 */
export function MemoryCard({ entry, updated }: Remembered) {
  const { t } = useTranslation();
  const del = useDeleteMemory();
  const [removed, setRemoved] = useState(false);

  const label = removed
    ? t("chat.memoryCard.removed")
    : updated
      ? t("chat.memoryCard.updated")
      : t("chat.memoryCard.saved");

  return (
    <div className="memory-card" data-removed={removed || undefined}>
      <span className="memory-card-icon">
        <Icon name="db" size={14} />
      </span>
      <div className="memory-card-text">
        <span className="memory-card-head">
          <strong>{label}</strong>
          <span className="memory-card-scope">{t(`chat.memoryCard.scope.${entry.scope}`)}</span>
        </span>
        <span className="memory-card-name">{entry.name}</span>
      </div>
      {!removed && (
        <button
          type="button"
          className="memory-card-delete"
          title={t("chat.memoryCard.delete")}
          disabled={del.isPending}
          onClick={() =>
            del.mutate(
              { scope: entry.scope, slug: entry.slug, cwd: entry.cwd },
              { onSuccess: () => setRemoved(true) },
            )
          }
        >
          <Icon name="trash" size={13} />
        </button>
      )}
    </div>
  );
}
