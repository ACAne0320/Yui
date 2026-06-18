import { create } from "zustand";

export type SettingsSection = "general" | "providers" | "subagents" | "extensions" | "about";

interface UiState {
  settingsOpen: boolean;
  settingsSection: SettingsSection;
  spotlightOpen: boolean;
  updateOpen: boolean;
  railCollapsed: boolean;
  railPeek: boolean;
  notice: string | null;
  openSettings: (section?: SettingsSection) => void;
  setSettingsOpen: (open: boolean) => void;
  setSettingsSection: (section: SettingsSection) => void;
  setSpotlightOpen: (open: boolean) => void;
  setUpdateOpen: (open: boolean) => void;
  setRailCollapsed: (collapsed: boolean) => void;
  setRailPeek: (peek: boolean) => void;
  setNotice: (notice: string | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  settingsOpen: false,
  settingsSection: "general",
  spotlightOpen: false,
  updateOpen: false,
  railCollapsed: false,
  railPeek: false,
  notice: null,
  openSettings: (settingsSection = "general") =>
    set({ settingsOpen: true, settingsSection, railPeek: false }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen, railPeek: false }),
  setSettingsSection: (settingsSection) => set({ settingsSection }),
  setSpotlightOpen: (spotlightOpen) => set({ spotlightOpen }),
  setUpdateOpen: (updateOpen) => set({ updateOpen }),
  setRailCollapsed: (railCollapsed) => set({ railCollapsed, railPeek: false }),
  setRailPeek: (railPeek) => set({ railPeek }),
  setNotice: (notice) => set({ notice }),
}));
