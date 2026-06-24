import { useEffect } from "react";
import { conversation } from "@renderer/features/chat/conversation";
import { useUiStore } from "@renderer/stores/ui-store";

export function useAppHotkeys() {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        useUiStore.setState((state) => ({ spotlightOpen: !state.spotlightOpen }));
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        void conversation.startNewConversation();
      }
      // Reload the active session's extensions/skills/prompts/settings in place.
      // Alt avoids Cmd/Ctrl+R and Cmd/Ctrl+Shift+R, which Electron reserves for
      // window reload; retune here if it proves unhandy. Match on physical
      // `code` because macOS Option+R rewrites `event.key` to "®".
      if ((event.metaKey || event.ctrlKey) && event.altKey && event.code === "KeyR") {
        event.preventDefault();
        void conversation.reloadSession();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [conversation.startNewConversation, conversation.reloadSession]);
}
