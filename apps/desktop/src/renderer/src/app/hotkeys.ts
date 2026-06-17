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
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [conversation.startNewConversation]);
}
