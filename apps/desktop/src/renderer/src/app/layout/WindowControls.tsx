import { conversation } from "@renderer/features/chat/conversation";
import { useTranslation } from "react-i18next";
import { useUiStore } from "@renderer/stores/ui-store";
import { Icon } from "@renderer/ui/Icon";

export function WindowControls() {
  const { t } = useTranslation();
  const railCollapsed = useUiStore((state) => state.railCollapsed);
  const setRailCollapsed = useUiStore((state) => state.setRailCollapsed);
  const setSpotlightOpen = useUiStore((state) => state.setSpotlightOpen);

  return (
    <div className="window-titlebar">
      <div className="win-controls">
        <div className="win-actions">
          <button
            className="win-btn"
            title={railCollapsed ? t("shell.pinSidebar") : t("shell.collapseSidebar")}
            onClick={() => setRailCollapsed(!railCollapsed)}
          >
            <Icon name="sidebar" size={17} />
          </button>
          <button
            className="win-btn"
            title={t("shell.search")}
            onClick={() => setSpotlightOpen(true)}
          >
            <Icon name="search" size={16} />
          </button>
          <button
            className="win-btn"
            title={t("shell.newChat")}
            onClick={() => void conversation.startNewConversation()}
          >
            <Icon name="plus" size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}
