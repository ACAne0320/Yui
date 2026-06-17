import type { ReactNode } from "react";
import { useUiStore } from "@renderer/stores/ui-store";
import { Sidebar } from "./Sidebar";
import { WindowControls } from "./WindowControls";

export function AppShell({ children }: { children: ReactNode }) {
  const railCollapsed = useUiStore((state) => state.railCollapsed);
  const railPeek = useUiStore((state) => state.railPeek);
  const setRailPeek = useUiStore((state) => state.setRailPeek);
  const settingsOpen = useUiStore((state) => state.settingsOpen);
  return (
    <div
      className={`app-shell${railCollapsed ? " rail-collapsed" : ""}${railPeek ? " rail-peek" : ""}`}
    >
      {!settingsOpen && <WindowControls />}
      {railCollapsed && <div className="rail-hotzone" onMouseEnter={() => setRailPeek(true)} />}
      <div className="rail-wrap" onMouseLeave={() => railCollapsed && setRailPeek(false)}>
        <Sidebar />
      </div>
      <main className="main-pane">{children}</main>
    </div>
  );
}
