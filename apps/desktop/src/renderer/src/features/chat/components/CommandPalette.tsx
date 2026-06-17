import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AppSessionSummary } from "@yui/contracts";
import { displayPath } from "@renderer/lib/format";
import { Icon } from "@renderer/ui/Icon";

export function CommandPalette({
  sessions,
  onClose,
  onPick,
}: {
  sessions: AppSessionSummary[];
  onClose: () => void;
  onPick: (session: AppSessionSummary) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = sessions.filter((session) =>
    `${session.title} ${session.cwd}`.toLowerCase().includes(query.toLowerCase()),
  );

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => setIndex(0), [query]);

  return (
    <div className="spotlight-overlay" onClick={onClose}>
      <div
        className="spotlight"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setIndex((value) => Math.min(value + 1, filtered.length - 1));
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setIndex((value) => Math.max(value - 1, 0));
          }
          if (event.key === "Enter" && filtered[index]) onPick(filtered[index]);
        }}
      >
        <div className="spotlight-input">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("chat.palette.placeholder")}
          />
          <kbd>esc</kbd>
        </div>
        <div className="spotlight-results scroll">
          {filtered.length ? (
            filtered.map((session, itemIndex) => (
              <button
                key={session.sessionPath}
                data-active={itemIndex === index}
                onMouseEnter={() => setIndex(itemIndex)}
                onClick={() => onPick(session)}
              >
                <Icon name="chat" size={15} />
                <span>
                  <strong>{session.title}</strong>
                  <small>{displayPath(session.cwd)}</small>
                </span>
              </button>
            ))
          ) : (
            <div className="spotlight-empty">{t("chat.palette.empty")}</div>
          )}
        </div>
      </div>
    </div>
  );
}
