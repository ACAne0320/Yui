// Composer image attachments: turn dropped/pasted/picked files into draft
// attachments held in the chat store. `base64` is what we send to the runtime;
// `objectUrl` backs the local preview and is revoked when the attachment leaves
// the composer (removed, sent, or replaced). The transcript renders *sent*
// images out-of-band via the `yui-attachment://` protocol, not these URLs.

import i18n from "@renderer/i18n";
import { useUiStore } from "@renderer/stores/ui-store";
import { useChatStore } from "./store";
import type { ComposerAttachment } from "./types";

/** Per-image and per-message limits, to keep session JSONL from ballooning. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS = 8;

let nextId = 0;

function isImage(file: File): boolean {
  return file.type.startsWith("image/");
}

/** Read a file's bytes as bare base64 (no `data:` URL prefix). */
function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("error", () => reject(reader.error ?? new Error("read failed")), {
      once: true,
    });
    reader.addEventListener(
      "load",
      () => {
        const result = String(reader.result);
        const comma = result.indexOf(",");
        resolve(comma === -1 ? result : result.slice(comma + 1));
      },
      { once: true },
    );
    reader.readAsDataURL(file);
  });
}

function notice(key: string, options?: Record<string, unknown>): void {
  useUiStore.getState().setNotice(i18n.t(key, options));
}

/**
 * Validate and add image files to the composer draft. Non-images and oversized
 * files are skipped with a notice; the total is capped at {@link MAX_ATTACHMENTS}.
 */
export async function addFiles(files: FileList | File[]): Promise<void> {
  const incoming = Array.from(files);
  if (incoming.length === 0) return;

  const images = incoming.filter(isImage);
  if (images.length < incoming.length) notice("chat.composer.attachments.notImage");

  const current = useChatStore.getState().attachments;
  const room = MAX_ATTACHMENTS - current.length;
  if (room <= 0) {
    notice("chat.composer.attachments.tooMany", { max: MAX_ATTACHMENTS });
    return;
  }

  const added: ComposerAttachment[] = [];
  for (const file of images.slice(0, room)) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      notice("chat.composer.attachments.tooLarge", { name: file.name });
      continue;
    }
    try {
      const base64 = await readBase64(file);
      added.push({
        id: `att_${Date.now()}_${nextId++}`,
        name: file.name || "image",
        mimeType: file.type,
        base64,
        objectUrl: URL.createObjectURL(file),
      });
    } catch {
      notice("chat.composer.attachments.readFailed", { name: file.name });
    }
  }
  if (images.length > room) notice("chat.composer.attachments.tooMany", { max: MAX_ATTACHMENTS });
  if (added.length === 0) return;

  // Re-read inside the setter window to avoid clobbering a concurrent add.
  const store = useChatStore.getState();
  store.setAttachments([...store.attachments, ...added]);
}

export function removeAttachment(id: string): void {
  const store = useChatStore.getState();
  const target = store.attachments.find((a) => a.id === id);
  if (target) URL.revokeObjectURL(target.objectUrl);
  store.setAttachments(store.attachments.filter((a) => a.id !== id));
}

/** Drop every draft attachment and free its preview URL. */
export function clearAttachments(): void {
  const store = useChatStore.getState();
  for (const attachment of store.attachments) URL.revokeObjectURL(attachment.objectUrl);
  if (store.attachments.length > 0) store.setAttachments([]);
}
