import { fireEvent, render, screen, within } from "@testing-library/react";
import type { AppSessionSummary } from "@yui/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { changeLocale } from "@renderer/i18n";
import { SessionList } from "./SessionList";

vi.mock("@renderer/data/profile", () => ({
  useProfile: () => ({ data: { config: { homeDir: "/home/user" } } }),
}));

function session(over: Partial<AppSessionSummary> = {}): AppSessionSummary {
  return {
    sessionId: "s1",
    sessionPath: "/home/user/agent/sessions/s1.jsonl",
    cwd: "/proj",
    title: "My chat",
    messageCount: 2,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...over,
  };
}

function renderList(onDelete = vi.fn(), onRename = vi.fn()) {
  render(
    <SessionList
      sessions={[session()]}
      loading={false}
      onPick={vi.fn()}
      onDelete={onDelete}
      onRename={onRename}
    />,
  );
  return { onDelete, onRename };
}

describe("SessionList delete", () => {
  beforeEach(async () => {
    await changeLocale("en-US");
  });

  it("confirms before deleting and only fires onDelete on confirm", () => {
    const { onDelete } = renderList();

    fireEvent.click(screen.getByRole("button", { name: "Delete chat" }));
    // The confirmation is up and warns it is irreversible; nothing deleted yet.
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText(/cannot be undone/i)).toBeTruthy();
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete chat" }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "s1" }));
  });

  it("cancels without deleting", () => {
    const { onDelete } = renderList();

    fireEvent.click(screen.getByRole("button", { name: "Delete chat" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("SessionList rename", () => {
  beforeEach(async () => {
    await changeLocale("en-US");
  });

  it("renames through the dialog, prefilled with the current title", () => {
    const { onRename } = renderList();

    fireEvent.click(screen.getByRole("button", { name: "Rename chat" }));
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("My chat");

    fireEvent.change(input, { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onRename).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "s1" }), "Renamed");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not rename on cancel", () => {
    const { onRename } = renderList();

    fireEvent.click(screen.getByRole("button", { name: "Rename chat" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
