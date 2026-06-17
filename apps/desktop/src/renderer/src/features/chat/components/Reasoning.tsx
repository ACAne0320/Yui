import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@renderer/ui/Icon";

export function Reasoning({ text, streaming }: { text: string; streaming: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(streaming);
  useEffect(() => {
    if (streaming) setOpen(true);
  }, [streaming]);
  const label = streaming ? t("chat.thinking.active") : t("chat.thinking.view");
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
