import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@renderer/data/keys";
import i18n from "@renderer/i18n";
import { api } from "@renderer/lib/api";
import { useUiStore } from "@renderer/stores/ui-store";
import { useChatStore } from "../store";

export function useAgentEvents() {
  const client = useQueryClient();

  useEffect(() => {
    return api.agents.onEvent((event) => {
      for (const effect of useChatStore.getState().applyEvent(event)) {
        if (effect.type === "notice") {
          useUiStore.getState().setNotice(effect.message);
        } else if (effect.type === "setEditorText") {
          // An extension wants to write the composer. Never clobber a draft
          // the user is typing; tell them what happened instead.
          if (useChatStore.getState().input.trim() === "") {
            useChatStore.getState().setInput(effect.text);
          } else {
            useUiStore.getState().setNotice(i18n.t("chat.extensions.editorTextBlocked"));
          }
        } else {
          void client.invalidateQueries({ queryKey: queryKeys.sessions });
          const sessionPath = useChatStore.getState().active?.sessionPath;
          if (sessionPath) {
            void client.invalidateQueries({ queryKey: queryKeys.sessionHistory(sessionPath) });
          }
        }
      }
    });
  }, [client]);
}
