// Resolves image bytes for a content-addressed `attachmentId` by scanning a
// session's branch entries for an image whose bytes hash to that id. Shared by
// two callers so a just-sent image resolves immediately:
//   - live (AgentService): the pooled session's in-memory SessionManager, which
//     holds the user message as soon as the turn is dispatched — before it is
//     flushed to the JSONL, so the transcript image is not a 404 mid-stream;
//   - cold (SessionCatalog): a freshly opened SessionManager, for reloads and
//     sessions that are not currently live.

import type { SessionEntry, SessionManager } from "@earendil-works/pi-coding-agent";
import type { SessionAttachment } from "@yui/contracts";
import { imageAttachmentId } from "./attachment-id.ts";

/** Branch entries that carry user-visible content arrays (where images live). */
function contentOf(entry: SessionEntry): unknown {
  if (entry.type === "message") return (entry.message as { content?: unknown }).content;
  if (entry.type === "custom_message") return (entry as { content?: unknown }).content;
  return undefined;
}

/** Find the image whose base64 hashes to `attachmentId`, or `undefined`. */
export function findAttachmentInManager(
  manager: SessionManager,
  attachmentId: string,
): SessionAttachment | undefined {
  for (const entry of manager.getBranch()) {
    const content = contentOf(entry);
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const b = block as { type?: unknown; data?: unknown; mimeType?: unknown };
      if (b.type !== "image" || typeof b.data !== "string") continue;
      if (imageAttachmentId(b.data) !== attachmentId) continue;
      return {
        mimeType: typeof b.mimeType === "string" ? b.mimeType : "application/octet-stream",
        bytes: Buffer.from(b.data, "base64"),
      };
    }
  }
  return undefined;
}
