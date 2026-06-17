import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@renderer/ui/Icon";

/**
 * Copy-to-clipboard button with unified feedback: the icon flips to a check
 * for a moment after a successful write (and only then — a denied clipboard
 * permission must not fake success).
 */
export function CopyButton({
  text,
  size = 13,
  className,
}: {
  text: string;
  size?: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <button
      className={className}
      title={copied ? t("common.actions.copied") : t("common.actions.copy")}
      onClick={() => {
        navigator.clipboard
          .writeText(text)
          .then(() => setCopied(true))
          .catch(() => {});
      }}
    >
      <Icon name={copied ? "check" : "copy"} size={size} />
    </button>
  );
}
