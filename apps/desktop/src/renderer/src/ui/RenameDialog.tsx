import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Modal for renaming a session. Renders nothing while closed; when open the
 * input is focused with its text selected, Enter submits the trimmed value, and
 * Escape cancels. Submitting an empty (or unchanged) value just closes.
 */
export function RenameDialog({
  open,
  title,
  placeholder,
  initialValue,
  onSubmit,
  onCancel,
}: {
  open: boolean;
  title: string;
  placeholder: string;
  initialValue: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialValue);

  // Reset to the latest source value each time the dialog opens, then select all
  // so the user can overwrite or edit.
  useEffect(() => {
    if (!open) return;
    setValue(initialValue);
    const input = inputRef.current;
    if (input) {
      input.focus();
      input.select();
    }
  }, [open, initialValue]);

  if (!open) return null;

  const trimmed = value.trim();
  const submit = () => {
    if (trimmed) onSubmit(trimmed);
    else onCancel();
  };

  return (
    <div
      className="confirm-overlay"
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel();
      }}
    >
      <div
        className="confirm-dialog rename-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <h3>{title}</h3>
        <input
          ref={inputRef}
          type="text"
          value={value}
          placeholder={placeholder}
          maxLength={200}
          spellCheck={false}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div className="confirm-actions">
          <button type="button" className="outline-button" onClick={onCancel}>
            {t("common.actions.cancel")}
          </button>
          <button type="button" className="primary-button" disabled={!trimmed} onClick={submit}>
            {t("common.actions.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
