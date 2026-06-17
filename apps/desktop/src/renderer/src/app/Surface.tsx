import { useSessions } from "@renderer/data/sessions";
import { ChatView } from "@renderer/features/chat/ChatView";
import { CommandPalette } from "@renderer/features/chat/components/CommandPalette";
import { conversation } from "@renderer/features/chat/conversation";
import { SettingsOverlay } from "@renderer/features/settings/SettingsOverlay";
import { useUiStore } from "@renderer/stores/ui-store";
import { Toast } from "@renderer/ui/Toast";
import { useAppHotkeys } from "./hotkeys";
import { AppShell } from "./layout/AppShell";

export function Surface() {
  const settingsOpen = useUiStore((state) => state.settingsOpen);
  const spotlightOpen = useUiStore((state) => state.spotlightOpen);
  const notice = useUiStore((state) => state.notice);
  const setSpotlightOpen = useUiStore((state) => state.setSpotlightOpen);
  const setNotice = useUiStore((state) => state.setNotice);
  const sessions = useSessions().data ?? [];

  useAppHotkeys();

  return (
    <AppShell>
      <ChatView />
      {settingsOpen && <SettingsOverlay />}
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
