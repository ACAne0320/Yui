import { useState } from "react";
import { useTranslation } from "react-i18next";
import { attachmentUrl } from "../attachment-url";
import { useChatStore } from "../store";

// Renders a sent message image from its content-addressed reference. The bytes
// load out-of-band through the `yui-attachment://` protocol (resolved from the
// session JSONL), so they never pass through the renderer's JS heap as base64.
export function AttachmentImage({ attachmentId }: { attachmentId: string }) {
  const { t } = useTranslation();
  const sessionPath = useChatStore((state) => state.active?.sessionPath);
  const [attempt, setAttempt] = useState(0);
  if (!sessionPath) return null;

  // A just-sent image can briefly 404 before its bytes are flushed to the
  // session file; retry a few times (cache-busting the URL) before giving up.
  const src = attachmentUrl(sessionPath, attachmentId) + (attempt > 0 ? `&r=${attempt}` : "");
  return (
    <img
      className="message-image"
      src={src}
      alt={t("chat.messages.imageAlt")}
      loading="lazy"
      onError={() => {
        if (attempt < 3) window.setTimeout(() => setAttempt((value) => value + 1), 300);
      }}
    />
  );
}
