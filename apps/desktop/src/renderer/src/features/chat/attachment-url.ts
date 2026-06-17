// Builds the `yui-attachment://` URL the main-process protocol handler serves
// (see apps/desktop/src/main/protocol/attachment-protocol.ts). Keep the query
// shape — `path` + `id` — in sync with that handler's parsing.

export function attachmentUrl(sessionPath: string, attachmentId: string): string {
  const params = new URLSearchParams({ path: sessionPath, id: attachmentId });
  return `yui-attachment://load/?${params.toString()}`;
}
