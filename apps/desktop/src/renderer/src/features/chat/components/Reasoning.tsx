import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@renderer/ui/Icon";

export function Reasoning({ text, streaming }: { text: string; streaming: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(streaming);
  useEffect(() => {
    if (streaming) setOpen(true);
  }, [streaming]);
  // The settled label is the thinking's own first line — a real gist of each
  // block instead of the same generic "View reasoning" repeated down the chain.
  const firstLine = text
    .split("\n")
    .find((line) => line.trim() !== "")
    ?.trim();
  const label = streaming ? t("chat.thinking.active") : (firstLine ?? t("chat.thinking.view"));
  return (
    <div className="reasoning" data-open={open}>
      <button onClick={() => !streaming && setOpen((value) => !value)}>
        {streaming ? <span className="spinner" /> : <Icon name="spark" size={14} />}
        <span>{label}</span>
        {!streaming && <Icon name="chevron" size={13} />}
      </button>
      {open && <div>{text}</div>}
    </div>
  );
}
