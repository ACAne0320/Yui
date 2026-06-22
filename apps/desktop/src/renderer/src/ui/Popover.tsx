import * as PopoverPrimitive from "@radix-ui/react-popover";
import { useEffect, useRef, useState, type ReactNode } from "react";

export function Popover({
  trigger,
  children,
  align = "start",
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "center" | "end";
}) {
  // Hover-to-open: pointer entering the trigger opens the panel, leaving either
  // the trigger or the panel closes it after a short grace period so the cursor
  // can cross the gap between them without it snapping shut. Click and keyboard
  // still toggle it through Radix's own onOpenChange, so this stays accessible.
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);

  const cancelClose = () => window.clearTimeout(closeTimer.current);
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  };
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        asChild
        onMouseEnter={() => {
          cancelClose();
          setOpen(true);
        }}
        onMouseLeave={scheduleClose}
      >
        {trigger}
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          className="ui-popover"
          align={align}
          sideOffset={8}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          // Hover-opening must not yank focus out of the textarea; closing must
          // not bounce it back onto the trigger.
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
