import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useChatStore } from "../store";

/**
 * The active conversation's title in the thread header.
 *
 * While a generated title is pending it pulses on the placeholder (the
 * truncated first message). When `titleRevealKey` bumps — i.e. a freshly
 * generated title arrives — it reveals the new title with a typewriter effect.
 * Plain title changes (opening another session) swap in without animation.
 */
const REVEAL_MS_PER_CHAR = 30;

export function ThreadTitle() {
  const { t } = useTranslation();
  const title = useChatStore((state) => state.active?.title) ?? t("chat.thread.newChat");
  const pending = useChatStore((state) => state.titlePending);
  const revealKey = useChatStore((state) => state.titleRevealKey);
  const [shown, setShown] = useState(title);
  const animatedKey = useRef(revealKey);

  useEffect(() => {
    if (revealKey === animatedKey.current) {
      setShown(title);
      return;
    }
    animatedKey.current = revealKey;
    setShown("");
    let count = 0;
    const timer = window.setInterval(() => {
      count += 1;
      setShown(title.slice(0, count));
      if (count >= title.length) window.clearInterval(timer);
    }, REVEAL_MS_PER_CHAR);
    return () => window.clearInterval(timer);
  }, [revealKey, title]);

  return (
    <span className="thread-title" data-pending={pending || undefined}>
      {shown}
    </span>
  );
}
