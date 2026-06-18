import { useMemo } from "react";
import type { AppSessionSummary } from "@yui/contracts";
import { useSessions } from "@renderer/data/sessions";
import { useTranslation } from "react-i18next";
import { SessionList } from "@renderer/features/chat/components/SessionList";
import { conversation } from "@renderer/features/chat/conversation";
import { useChatStore } from "@renderer/features/chat/store";
import type { ActiveConversation } from "@renderer/features/chat/types";
import { useUiStore } from "@renderer/stores/ui-store";
import { useUpdateStore } from "@renderer/stores/update-store";
import { Icon } from "@renderer/ui/Icon";

export function Sidebar() {
  const { t } = useTranslation();
  const openSettings = useUiStore((state) => state.openSettings);
  const setUpdateOpen = useUiStore((state) => state.setUpdateOpen);
  const updatePhase = useUpdateStore((state) => state.state?.phase);
  // Surface the entry the moment a release is found and keep it through the
  // download so the user always has a way back into the flow.
  const showUpdate =
    updatePhase === "available" || updatePhase === "downloading" || updatePhase === "downloaded";
  const persisted = useSessions().data ?? [];
  const active = useChatStore((state) => state.active);
  const cachedRealtime = useChatStore((state) => state.realtimeBySessionId);
  const runningPaths = useChatStore((state) => state.runningSessionPaths);
  const loading = useChatStore((state) => state.loadingConversation);

  // A freshly started session isn't in the persisted listing until its first
  // turn ends and the catalog refresh picks it up. Only then would it appear,
  // so prepend a live overlay *just for that gap*. Once it's persisted (or for
  // any already-listed session, e.g. one the user clicks) we leave the listing
  // untouched — overlaying an existing entry would yank it to the top.
  const sessions = useMemo<AppSessionSummary[]>(() => {
    const existing = new Set(persisted.map((session) => session.sessionPath));
    const overlays = Object.values(cachedRealtime)
      .map((realtime) => realtime.active)
      .filter((item): item is ActiveConversation => Boolean(item?.sessionPath))
      .filter((item) => !existing.has(item.sessionPath!))
      .map<AppSessionSummary>((item) => ({
        sessionId: item.sessionId ?? "",
        sessionPath: item.sessionPath!,
        cwd: item.cwd,
        title: item.title,
        messageCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));
    return [...overlays, ...persisted];
  }, [persisted, cachedRealtime]);

  return (
    <aside className="sidebar">
      <SessionList
        sessions={sessions}
        activePath={active?.sessionPath}
        runningPaths={runningPaths}
        loading={loading}
        onPick={(session) => void conversation.openConversation(session)}
        onDelete={(session) => void conversation.deleteConversation(session)}
      />
      {showUpdate && (
        <button className="update-entry" onClick={() => setUpdateOpen(true)}>
          <Icon name="download" size={16} />
          <span>
            {updatePhase === "downloaded"
              ? t("update.sidebar.ready")
              : t("update.sidebar.available")}
          </span>
          <span className="update-dot" aria-hidden="true" />
        </button>
      )}
      <button className="settings-entry" onClick={() => openSettings()}>
        <Icon name="settings" size={16} />
        <span>{t("shell.settings")}</span>
      </button>
    </aside>
  );
}
