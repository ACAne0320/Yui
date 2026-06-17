// Content-addressed id for an inbound image attachment.
//
// The mapper (`message-mapper.ts`) and the byte reader (`attachment-reader.ts`)
// must agree on this hash so an `attachmentId` emitted on an event resolves back
// to the same image bytes in the session JSONL. Both hold the image's base64
// `data` string, so we hash that string directly — no decode, no ambiguity.

import { createHash } from "node:crypto";

/** sha256 (hex) of an image's base64 `data`. Stable across runs and processes. */
export function imageAttachmentId(base64Data: string): string {
  return createHash("sha256").update(base64Data).digest("hex");
}
