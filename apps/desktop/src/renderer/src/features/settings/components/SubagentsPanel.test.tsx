import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SubagentCatalog } from "@yui/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { changeLocale } from "@renderer/i18n";
import { SubagentsPanel } from "./SubagentsPanel";

const saveMutate = vi.fn().mockResolvedValue(undefined);
const deleteMutate = vi.fn().mockResolvedValue(undefined);

const catalog: SubagentCatalog = {
  availableTools: ["read", "bash", "edit"],
  agents: [
    {
      name: "planner",
      description: "Plans things",
      systemPrompt: "You plan.",
      tools: ["read"],
      builtin: true,
      hasFile: false,
    },
    {
      name: "scout",
      description: "Explores",
      systemPrompt: "You scout.",
      builtin: false,
      hasFile: true,
    },
    {
      name: "ghostly",
      description: "Has a stale model",
      systemPrompt: "p",
      model: "anthropic/old-model",
      builtin: false,
      hasFile: true,
    },
  ],
};

vi.mock("@renderer/data/subagents", () => ({
  useSubagents: () => ({ data: catalog }),
  useSaveSubagent: () => ({ mutateAsync: saveMutate, isPending: false }),
  useDeleteSubagent: () => ({ mutateAsync: deleteMutate, isPending: false }),
}));
vi.mock("@renderer/data/models", () => ({
  useModels: () => ({
    data: [{ providerId: "anthropic", modelId: "claude-test", name: "Claude Test" }],
  }),
}));

describe("SubagentsPanel", () => {
  beforeEach(async () => {
    await changeLocale("en-US");
    saveMutate.mockClear();
    deleteMutate.mockClear();
  });

  it("lists agents with capitalized names and locks the name field for builtins", () => {
    render(<SubagentsPanel />);
    // Capitalized in the list and as the selected editor's heading.
    expect(screen.getAllByText("Planner")).toHaveLength(2);
    expect(screen.getByText("Scout")).toBeTruthy();
    const name = screen.getByLabelText("Name") as HTMLInputElement;
    expect(name.value).toBe("planner");
    expect(name.disabled).toBe(true);
  });

  it("shows tool checkboxes seeded from the agent's allowlist", () => {
    render(<SubagentsPanel />);
    // planner restricts tools → custom mode active with "read" checked.
    const read = screen.getByLabelText("read") as HTMLInputElement;
    expect(read.checked).toBe(true);
    expect((screen.getByLabelText("bash") as HTMLInputElement).checked).toBe(false);
  });

  it("saves edits, sending the checked tools and previousName on rename", async () => {
    render(<SubagentsPanel />);
    fireEvent.click(screen.getByText("Scout"));

    const name = screen.getByLabelText("Name") as HTMLInputElement;
    fireEvent.change(name, { target: { value: "ranger" } });
    // scout has no restriction → switch to a custom allowlist.
    fireEvent.click(screen.getByText("Custom allowlist"));
    fireEvent.click(screen.getByLabelText("read"));
    fireEvent.click(screen.getByLabelText("bash"));
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(saveMutate).toHaveBeenCalledTimes(1));
    expect(saveMutate).toHaveBeenCalledWith({
      name: "ranger",
      previousName: "scout",
      description: "Explores",
      systemPrompt: "You scout.",
      tools: ["read", "bash"],
      model: undefined,
    });
  });

  it("rejects an empty custom allowlist", async () => {
    render(<SubagentsPanel />);
    fireEvent.click(screen.getByText("Scout"));
    fireEvent.click(screen.getByText("Custom allowlist"));
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(screen.getByText(/at least one tool/)).toBeTruthy());
    expect(saveMutate).not.toHaveBeenCalled();
  });

  it("keeps an unavailable model selectable and warns instead of dropping it", () => {
    render(<SubagentsPanel />);
    fireEvent.click(screen.getByText("Ghostly"));

    const select = screen.getByLabelText("Model") as HTMLSelectElement;
    expect(select.value).toBe("anthropic/old-model");
    expect(screen.getByText(/fail explicitly/)).toBeTruthy();
  });

  it("deletes through the confirm dialog", async () => {
    render(<SubagentsPanel />);
    fireEvent.click(screen.getByText("Scout"));

    fireEvent.click(screen.getByText("Delete"));
    expect(deleteMutate).not.toHaveBeenCalled();
    expect(screen.getByText(/cannot be undone/)).toBeTruthy();
    fireEvent.click(screen.getByRole("alertdialog").querySelector(".danger-button")!);
    await waitFor(() => expect(deleteMutate).toHaveBeenCalledWith({ name: "scout" }));
  });

  it("cancel in the confirm dialog leaves the agent alone", () => {
    render(<SubagentsPanel />);
    fireEvent.click(screen.getByText("Scout"));
    fireEvent.click(screen.getByText("Delete"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(deleteMutate).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
