import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AppSessionSummary } from "@yui/contracts";
import { useProfile } from "@renderer/data/profile";
import { ConfirmDialog } from "@renderer/ui/ConfirmDialog";
import { Icon } from "@renderer/ui/Icon";
import { RenameDialog } from "@renderer/ui/RenameDialog";
import { sessionGroup, TEMP_GROUP_KEY } from "../lib";

const timeGroupKeys = {
  today: "chat.sessionList.today",
  thisWeek: "chat.sessionList.thisWeek",
  older: "chat.sessionList.older",
} as const;

// Scratch workspaces live under `<homeDir>/scratch`; normalize separators so the
// prefix check is OS-agnostic (the main process uses the native separator).
const toPosix = (path: string) => path.replace(/\\/g, "/");

export function SessionList({
  sessions,
  activePath,
  runningPaths,
  loading,
  onPick,
  onDelete,
  onRename,
}: {
  sessions: AppSessionSummary[];
  activePath?: string;
  /** Sessions whose turns are currently streaming; shows running indicators. */
  runningPaths?: string[];
  loading: boolean;
  onPick: (session: AppSessionSummary) => void;
  onDelete: (session: AppSessionSummary) => void;
  onRename: (session: AppSessionSummary, title: string) => void;
}) {
  const { t } = useTranslation();
  const profile = useProfile();
  const [groupMode, setGroupMode] = useState<"time" | "workspace">("time");
  const [pendingDelete, setPendingDelete] = useState<AppSessionSummary | null>(null);
  const [pendingRename, setPendingRename] = useState<AppSessionSummary | null>(null);
  const homeDir = profile.data?.config.homeDir ?? "";
  const scratchPrefix = homeDir ? `${toPosix(homeDir)}/scratch/` : "";
  const groups = useMemo(() => {
    const isScratch = (path: string) =>
      scratchPrefix !== "" && toPosix(path).startsWith(scratchPrefix);
    const result = new Map<string, AppSessionSummary[]>();
    for (const session of sessions) {
      const key = sessionGroup(session.cwd, groupMode, session.updatedAt, isScratch);
      result.set(key, [...(result.get(key) ?? []), session]);
    }
    // Keep the consolidated temporary-directory bucket at the bottom in workspace
    // mode so real workspaces lead the list.
    return [...result.entries()].toSorted(([a], [b]) => {
      if (a === TEMP_GROUP_KEY) return 1;
      if (b === TEMP_GROUP_KEY) return -1;
      return 0;
    });
  }, [groupMode, sessions, scratchPrefix]);

  return (
    <>
      <div className="rail-listhead">
        <span>
          {groupMode === "time" ? t("chat.sessionList.recent") : t("chat.sessionList.byWorkspace")}
        </span>
        <div className="group-switch">
          <button
            data-active={groupMode === "time"}
            onClick={() => setGroupMode("time")}
            title={t("chat.sessionList.groupByTime")}
          >
            <Icon name="clock" size={13} />
          </button>
          <button
            data-active={groupMode === "workspace"}
            onClick={() => setGroupMode("workspace")}
            title={t("chat.sessionList.groupByWorkspace")}
          >
            <Icon name="folder" size={13} />
          </button>
        </div>
      </div>
      <div className="conversation-list scroll">
        {groups.length ? (
          groups.map(([group, items]) => (
            <section key={group}>
              <h3>
                {groupMode === "time"
                  ? t(timeGroupKeys[group as keyof typeof timeGroupKeys])
                  : group === TEMP_GROUP_KEY
                    ? t("chat.composer.temporaryDirectory")
                    : group}
              </h3>
              {items.map((session) => {
                const title = session.title || t("chat.sessionList.untitled");
                const running = runningPaths?.includes(session.sessionPath) ?? false;
                return (
                  <div
                    key={session.sessionPath}
                    className="conversation-row"
                    data-active={activePath === session.sessionPath}
                  >
                    <button
                      className="conversation-row-pick"
                      disabled={loading}
                      onClick={() => onPick(session)}
                    >
                      {running && (
                        <i
                          className="conversation-running"
                          role="img"
                          aria-label={t("chat.sessionList.running")}
                        />
                      )}
                      <span>{title}</span>
                    </button>
                    <div className="conversation-row-actions">
                      <button
                        className="conversation-row-action"
                        disabled={loading}
                        title={t("chat.sessionList.rename")}
                        aria-label={t("chat.sessionList.rename")}
                        onClick={() => setPendingRename(session)}
                      >
                        <Icon name="edit" size={14} />
                      </button>
                      <button
                        className="conversation-row-action conversation-row-delete"
                        disabled={loading}
                        title={t("chat.sessionList.delete")}
                        aria-label={t("chat.sessionList.delete")}
                        onClick={() => setPendingDelete(session)}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </section>
          ))
        ) : (
          <div className="sidebar-empty">
            <Icon name="chat" size={18} />
            <span>{t("chat.sessionList.empty")}</span>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("chat.sessionList.deleteTitle")}
        message={t("chat.sessionList.deleteConfirm", {
          title: pendingDelete?.title || t("chat.sessionList.untitled"),
        })}
        confirmLabel={t("chat.sessionList.delete")}
        onConfirm={() => {
          if (pendingDelete) onDelete(pendingDelete);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
      <RenameDialog
        open={pendingRename !== null}
        title={t("chat.sessionList.renameTitle")}
        placeholder={t("chat.sessionList.renamePlaceholder")}
        initialValue={pendingRename?.title ?? ""}
        onSubmit={(value) => {
          if (pendingRename) onRename(pendingRename, value);
          setPendingRename(null);
        }}
        onCancel={() => setPendingRename(null)}
      />
    </>
  );
}
