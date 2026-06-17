import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

/**
 * Modal confirmation for destructive actions. Renders nothing while closed;
 * when open, Escape cancels and the confirm button gets initial focus so
 * Enter confirms.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="confirm-overlay"
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel();
      }}
    >
      <div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-label={title}>
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="confirm-actions">
          <button type="button" className="outline-button" onClick={onCancel}>
            {t("common.actions.cancel")}
          </button>
          <button type="button" className="danger-button" ref={confirmRef} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
