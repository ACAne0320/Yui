import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ExtensionCatalog } from "@yui/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { changeLocale } from "@renderer/i18n";
import { ExtensionsPanel } from "./ExtensionsPanel";

const setEnabledMutate = vi.fn().mockResolvedValue(undefined);
const deleteMutate = vi.fn().mockResolvedValue(undefined);
const addPathMutate = vi.fn().mockResolvedValue(undefined);
const removePathMutate = vi.fn().mockResolvedValue(undefined);
const openPath = vi.fn().mockResolvedValue("");

const catalog: ExtensionCatalog = {
  directory: "/home/agent/extensions",
  disabledDirectory: "/home/agent/extensions-disabled",
  entries: [
    {
      name: "hooks.ts",
      path: "/home/agent/extensions/hooks.ts",
      kind: "file",
      source: "directory",
      enabled: true,
      tools: [{ name: "demo_tool", description: "A demo tool" }],
      commands: [{ name: "demo", description: "A demo command" }],
    },
    {
      name: "broken.ts",
      path: "/home/agent/extensions/broken.ts",
      kind: "file",
      source: "directory",
      enabled: true,
      tools: [],
      commands: [],
      error: "Failed to load extension: boom",
    },
    {
      name: "~/elsewhere/ext.ts",
      path: "/home/elsewhere/ext.ts",
      kind: "file",
      source: "settings",
      enabled: true,
      tools: [],
      commands: [],
    },
  ],
  packages: [{ source: "npm:some-pack", filtered: false }],
};

vi.mock("@renderer/data/extensions", () => ({
  useExtensionCatalog: () => ({ data: catalog }),
  useSetExtensionEnabled: () => ({ mutateAsync: setEnabledMutate, isPending: false }),
  useDeleteExtension: () => ({ mutateAsync: deleteMutate, isPending: false }),
  useAddExtensionPath: () => ({ mutateAsync: addPathMutate, isPending: false }),
  useRemoveExtensionPath: () => ({ mutateAsync: removePathMutate, isPending: false }),
}));
vi.mock("@renderer/lib/api", () => ({
  api: { desktop: { openPath: (input: unknown) => openPath(input) } },
}));

describe("ExtensionsPanel", () => {
  beforeEach(async () => {
    await changeLocale("en-US");
    setEnabledMutate.mockClear();
    deleteMutate.mockClear();
    addPathMutate.mockClear();
    removePathMutate.mockClear();
    openPath.mockClear();
  });

  it("groups directory entries, settings paths, and packages", () => {
    render(<ExtensionsPanel />);
    expect(screen.getByText("Extensions folder")).toBeTruthy();
    expect(screen.getByText("settings.json paths")).toBeTruthy();
    expect(screen.getByText("~/elsewhere/ext.ts")).toBeTruthy();
    expect(screen.getByText("npm:some-pack")).toBeTruthy();
    expect(screen.getByText(/managed by the pi CLI/)).toBeTruthy();
    // Selected by default: first entry with its probe results.
    expect(screen.getByText("demo_tool")).toBeTruthy();
    expect(screen.getByText("/demo")).toBeTruthy();
  });

  it("surfaces load errors for broken extensions", () => {
    render(<ExtensionsPanel />);
    fireEvent.click(screen.getByText("broken.ts"));
    expect(screen.getByText("Failed to load extension: boom")).toBeTruthy();
    expect(screen.getAllByText("Load failed").length).toBeGreaterThan(0);
  });

  it("collapses empty tool and command sections into one state", () => {
    render(<ExtensionsPanel />);
    fireEvent.click(screen.getByText("~/elsewhere/ext.ts"));
    expect(screen.getByText("No tools or commands registered.")).toBeTruthy();
    expect(screen.queryByText("Registered tools")).toBeNull();
    expect(screen.queryByText("Registered commands")).toBeNull();
  });

  it("toggles enablement for directory entries only", () => {
    render(<ExtensionsPanel />);
    // hooks.ts is the default selection.
    fireEvent.click(screen.getByText("Disable"));
    expect(setEnabledMutate).toHaveBeenCalledWith({ name: "hooks.ts", enabled: false });

    fireEvent.click(screen.getByText("~/elsewhere/ext.ts"));
    expect(screen.queryByText("Disable")).toBeNull();
  });

  it("deletes a directory entry through the confirm dialog", async () => {
    render(<ExtensionsPanel />);
    fireEvent.click(screen.getByText("Open extensions folder"));
    expect(openPath).toHaveBeenCalledWith({ path: "/home/agent/extensions" });

    fireEvent.click(screen.getByText("Delete"));
    expect(deleteMutate).not.toHaveBeenCalled();
    expect(screen.getByText(/cannot be undone/)).toBeTruthy();
    fireEvent.click(screen.getByRole("alertdialog").querySelector(".danger-button")!);
    await waitFor(() => expect(deleteMutate).toHaveBeenCalledWith({ name: "hooks.ts" }));
  });

  it("removes a settings path with a file-untouched warning", async () => {
    render(<ExtensionsPanel />);
    fireEvent.click(screen.getByText("~/elsewhere/ext.ts"));
    fireEvent.click(screen.getByText("Remove path"));
    expect(screen.getByText(/the file itself is untouched/)).toBeTruthy();
    fireEvent.click(screen.getByRole("alertdialog").querySelector(".danger-button")!);
    await waitFor(() =>
      expect(removePathMutate).toHaveBeenCalledWith({ path: "~/elsewhere/ext.ts" }),
    );
  });

  it("adds a settings path from the list pane", async () => {
    render(<ExtensionsPanel />);
    fireEvent.change(screen.getByPlaceholderText("/path/to/extension.ts"), {
      target: { value: "  /new/ext.ts " },
    });
    fireEvent.click(screen.getByText("Add"));
    await waitFor(() => expect(addPathMutate).toHaveBeenCalledWith({ path: "/new/ext.ts" }));
  });
});
