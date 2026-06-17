// Serves message-image bytes to the renderer out-of-band.
//
// Image blocks in events/history carry only a content-addressed `attachmentId`
// (sha256 of the bytes), never the bytes themselves. The renderer renders
// `<img src="yui-attachment://load/?path=<sessionPath>&id=<attachmentId>">`, and
// this handler resolves those bytes from the session JSONL via the runtime. The
// bytes therefore stream straight from disk to Chromium's image decoder without
// ever entering the renderer's JS heap as base64, and Chromium caches them.

import { protocol } from "electron";
import type { AppRuntime } from "@yui/contracts";

export const ATTACHMENT_SCHEME = "yui-attachment";

/**
 * Register the scheme as privileged. MUST run before the app `ready` event
 * (Electron only honors privileged-scheme registration at startup), so callers
 * invoke this at module/startup scope, not inside `whenReady`.
 */
export function registerAttachmentScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ATTACHMENT_SCHEME,
      // standard: predictable URL parsing; secure: not treated as mixed content;
      // supportFetchAPI/stream: loadable as an <img>/fetch subresource.
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
    },
  ]);
}

/** Install the request handler. Run after `whenReady` with the live runtime. */
export function installAttachmentProtocol(runtime: AppRuntime): void {
  protocol.handle(ATTACHMENT_SCHEME, async (request) => {
    let sessionPath: string | null;
    let attachmentId: string | null;
    try {
      const url = new URL(request.url);
      sessionPath = url.searchParams.get("path");
      attachmentId = url.searchParams.get("id");
    } catch {
      return new Response(null, { status: 400 });
    }
    if (!sessionPath || !attachmentId) {
      return new Response(null, { status: 400 });
    }

    // Prefer the live session's in-memory history (covers a just-sent image
    // mid-stream, before flush); fall back to the cold JSONL read for reloads
    // and inactive sessions.
    const attachment =
      (await runtime.agents.getLiveAttachment(sessionPath, attachmentId).catch(() => undefined)) ??
      (await runtime.sessions.getAttachment(sessionPath, attachmentId).catch(() => undefined));
    if (!attachment) {
      return new Response(null, { status: 404 });
    }

    return new Response(attachment.bytes, {
      status: 200,
      headers: {
        "Content-Type": attachment.mimeType,
        // Content-addressed: the bytes behind an id never change.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  });
}
