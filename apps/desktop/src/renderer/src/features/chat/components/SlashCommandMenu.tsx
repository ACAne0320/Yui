import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@renderer/ui/Icon";
import type { SlashCommand } from "../slash-commands";

export function SlashCommandMenu({
  commands,
  activeIndex,
  onHover,
  onActivate,
}: {
  commands: SlashCommand[];
  activeIndex: number;
  onHover: (index: number) => void;
  onActivate: (command: SlashCommand) => void;
}) {
  const { t } = useTranslation();
  const activeRef = useRef<HTMLButtonElement>(null);

  // Keep the keyboard-selected row in view as the user arrows through.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <div className="slash-menu" role="listbox" aria-label={t("chat.slash.label")}>
      <div className="slash-menu-list scroll">
        {commands.map((command, index) => (
          <button
            key={command.id}
            ref={index === activeIndex ? activeRef : undefined}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            data-active={index === activeIndex}
            onMouseEnter={() => onHover(index)}
            // mousedown (not click) so activating doesn't first blur the textarea.
            onMouseDown={(event) => {
              event.preventDefault();
              onActivate(command);
            }}
          >
            <Icon name={command.icon} size={15} />
            <span>
              <strong>
                /{command.token}
                {command.kind === "extension" && (
                  <em className="slash-tag">{t("chat.slash.extensionTag")}</em>
                )}
              </strong>
              {command.description && <small>{command.description}</small>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
