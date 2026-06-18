import { create } from "zustand";
import { api } from "@renderer/lib/api";
import type { UpdateState } from "../../../shared/update-api";

// Re-check this often while the app stays open, so a long-running window still
// notices a release published mid-session.
const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

interface UpdateStore {
  state: UpdateState | null;
  // Guards against wiring the event listener and initial check more than once.
  initialized: boolean;
  init: () => void;
  check: () => void;
  download: () => void;
  install: () => void;
}

export const useUpdateStore = create<UpdateStore>((set, get) => ({
  state: null,
  initialized: false,
  init: () => {
    if (get().initialized) {
      return;
    }
    set({ initialized: true });
    // The main process pushes a fresh snapshot on every transition; mirror it.
    api.update.onEvent((state) => set({ state }));
    void api.update.getState().then((state) => set({ state }));
    void api.update.check().then((state) => set({ state }));
    setInterval(() => void api.update.check().then((state) => set({ state })), RECHECK_INTERVAL_MS);
  },
  check: () => void api.update.check().then((state) => set({ state })),
  download: () => void api.update.download().then((state) => set({ state })),
  // install() quits the app, so there's nothing to await or store.
  install: () => void api.update.install().catch(() => undefined),
}));
