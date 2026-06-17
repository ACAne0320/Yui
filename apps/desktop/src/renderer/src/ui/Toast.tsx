import * as ToastPrimitive from "@radix-ui/react-toast";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "./Icon";

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <ToastPrimitive.Provider swipeDirection="right">
      {children}
      <ToastPrimitive.Viewport className="toast-viewport" />
    </ToastPrimitive.Provider>
  );
}

export function Toast({ message, onClose }: { message: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <ToastPrimitive.Root
      className="toast"
      open={Boolean(message)}
      onOpenChange={(open) => !open && onClose()}
    >
      <Icon name="info" size={16} />
      <ToastPrimitive.Description>{message}</ToastPrimitive.Description>
      <ToastPrimitive.Close aria-label={t("common.actions.close")}>
        <Icon name="close" size={14} />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
}
