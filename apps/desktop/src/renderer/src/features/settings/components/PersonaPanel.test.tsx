import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { changeLocale } from "@renderer/i18n";
import { PersonaPanel } from "./PersonaPanel";

const saveMutate = vi.fn().mockResolvedValue({
  content: "New soul",
  path: "/tmp/persona/SOUL.md",
});

vi.mock("@renderer/data/persona", () => ({
  useSoul: () => ({ data: { content: "Old soul", path: "/tmp/persona/SOUL.md" } }),
  useSaveSoul: () => ({ mutateAsync: saveMutate, isPending: false }),
  usePersonaConfig: () => ({ data: { memoryEnabled: true } }),
  useSetPersonaConfig: () => ({ mutate: vi.fn(), isPending: false }),
  useMemoryEntries: () => ({ data: [] }),
  useSaveMemory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteMemory: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe("PersonaPanel", () => {
  beforeEach(async () => {
    await changeLocale("en-US");
    saveMutate.mockClear();
  });

  it("edits and saves SOUL through the persona API hook", async () => {
    render(<PersonaPanel />);

    const editor = screen.getByLabelText("SOUL") as HTMLTextAreaElement;
    expect(editor.value).toBe("Old soul");
    fireEvent.change(editor, { target: { value: "New soul" } });
    fireEvent.click(screen.getByText("Save SOUL"));

    await waitFor(() => expect(saveMutate).toHaveBeenCalledWith({ content: "New soul" }));
    expect(screen.getByText("Saved.")).toBeTruthy();
    expect(screen.getByText(/opened afterwards/)).toBeTruthy();
  });

  it("switches between the Identity and Memory tabs", () => {
    render(<PersonaPanel />);

    // Identity is the default tab: the SOUL editor is mounted, memory is not.
    expect(screen.getByLabelText("SOUL")).toBeTruthy();
    expect(screen.queryByText("Global — preferences & base facts")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Memory" }));

    expect(screen.getByText("Global — preferences & base facts")).toBeTruthy();
    expect(screen.queryByLabelText("SOUL")).toBeNull();
  });
});
