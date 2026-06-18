import { useEffect } from "react";
import { useSessions } from "@renderer/data/sessions";
import { ChatView } from "@renderer/features/chat/ChatView";
import { CommandPalette } from "@renderer/features/chat/components/CommandPalette";
import { conversation } from "@renderer/features/chat/conversation";
import { SettingsOverlay } from "@renderer/features/settings/SettingsOverlay";
import { UpdateDialog } from "@renderer/features/update/UpdateDialog";
import { useUiStore } from "@renderer/stores/ui-store";
import { useUpdateStore } from "@renderer/stores/update-store";
import { Toast } from "@renderer/ui/Toast";
import { useAppHotkeys } from "./hotkeys";
import { AppShell } from "./layout/AppShell";

export function Surface() {
  const settingsOpen = useUiStore((state) => state.settingsOpen);
  const spotlightOpen = useUiStore((state) => state.spotlightOpen);
  const updateOpen = useUiStore((state) => state.updateOpen);
  const notice = useUiStore((state) => state.notice);
  const setSpotlightOpen = useUiStore((state) => state.setSpotlightOpen);
  const setNotice = useUiStore((state) => state.setNotice);
  const initUpdates = useUpdateStore((state) => state.init);
  const sessions = useSessions().data ?? [];

  useAppHotkeys();

  // Wire the update-event listener and kick off the first check once, on mount.
  useEffect(() => initUpdates(), [initUpdates]);

  return (
    <AppShell>
      <ChatView />
      {settingsOpen && <SettingsOverlay />}
      {updateOpen && <UpdateDialog />}
      {spotlightOpen && (
        <CommandPalette
          sessions={sessions}
          onClose={() => setSpotlightOpen(false)}
          onPick={(session) => {
            setSpotlightOpen(false);
            void conversation.openConversation(session);
          }}
        />
      )}
      <Toast message={notice} onClose={() => setNotice(null)} />
    </AppShell>
  );
}
