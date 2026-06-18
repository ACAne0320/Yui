import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UpdateState } from "../../../../../shared/update-api";
import { useUiStore } from "@renderer/stores/ui-store";
import { useUpdateStore } from "@renderer/stores/update-store";
import { AboutPanel } from "./AboutPanel";

// The store imports the preload bridge; stub it so its actions are safe to call.
// `vi.hoisted` lets the hoisted `vi.mock` factory reference this mock.
// The store calls `.then()` on the result, so the stub must return a promise.
const { check } = vi.hoisted(() => ({ check: vi.fn(() => Promise.resolve()) }));
vi.mock("@renderer/lib/api", () => ({
  api: {
    update: { check, download: vi.fn(), install: vi.fn(), onEvent: vi.fn(), getState: vi.fn() },
  },
}));

function setUpdateState(partial: Partial<UpdateState>): void {
  useUpdateStore.setState({
    state: {
      phase: "idle",
      currentVersion: "0.0.2",
      latest: null,
      downloadProgress: null,
      error: null,
      supported: true,
      ...partial,
    },
  });
}

beforeEach(() => {
  check.mockClear();
  useUiStore.setState({ updateOpen: false });
});

afterEach(() => {
  useUpdateStore.setState({ state: null });
});

describe("AboutPanel", () => {
  it("shows the current version and an up-to-date status", () => {
    setUpdateState({ phase: "not-available" });
    render(<AboutPanel />);

    expect(screen.getByText("Version 0.0.2")).toBeTruthy();
    expect(screen.getByText("You're on the latest version")).toBeTruthy();
    // No entry into the update dialog when there's nothing to install.
    expect(screen.queryByText("Update")).toBeNull();
  });

  it("checks for updates when the button is clicked", () => {
    setUpdateState({ phase: "not-available" });
    render(<AboutPanel />);

    fireEvent.click(screen.getByText("Check for updates"));
    expect(check).toHaveBeenCalledOnce();
  });

  it("opens the update dialog from the Update button when a release is available", () => {
    setUpdateState({
      phase: "available",
      latest: {
        version: "0.0.5",
        tag: "v0.0.5",
        notes: "## v0.0.5",
        publishedAt: null,
        url: "https://example.test",
      },
    });
    render(<AboutPanel />);

    expect(screen.getByText("Update available — v0.0.5")).toBeTruthy();
    fireEvent.click(screen.getByText("Update"));
    expect(useUiStore.getState().updateOpen).toBe(true);
  });

  it("disables the check button and explains when updates are unsupported", () => {
    setUpdateState({ phase: "idle", supported: false });
    render(<AboutPanel />);

    expect(screen.getByText("Automatic updates aren't available for this build.")).toBeTruthy();
    expect(screen.getByText("Check for updates").closest("button")?.disabled).toBe(true);
  });
});
