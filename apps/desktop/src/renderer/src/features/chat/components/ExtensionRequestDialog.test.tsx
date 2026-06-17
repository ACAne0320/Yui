import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ExtensionUiRequest } from "@yui/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore } from "../store";
import { emptyExtensionUi } from "../types";
import { ExtensionRequestDialog } from "./ExtensionRequestDialog";

const respondToExtensionUi = vi.fn(async (_input: unknown) => undefined);

vi.mock("@renderer/lib/api", () => ({
  api: { agents: { respondToExtensionUi: (input: unknown) => respondToExtensionUi(input) } },
}));

function seed(requests: ExtensionUiRequest[]) {
  useChatStore.setState({
    active: {
      sessionId: "s1",
      title: "T",
      cwd: "/tmp",
      thinkingLevel: "medium",
    },
    extensionUi: { ...emptyExtensionUi(), pendingRequests: requests },
  });
}

beforeEach(() => {
  respondToExtensionUi.mockClear();
  useChatStore.setState({ active: null, extensionUi: emptyExtensionUi() });
});

describe("ExtensionRequestDialog", () => {
  it("renders nothing without pending requests", () => {
    const { container } = render(<ExtensionRequestDialog />);
    expect(container.innerHTML).toBe("");
  });

  it("answers a confirm and closes, revealing the next queued request", async () => {
    seed([
      { requestId: "r1", kind: "confirm", title: "Allow tool?", message: "Run it?" },
      { requestId: "r2", kind: "select", title: "Pick one", options: ["a", "b"] },
    ]);
    render(<ExtensionRequestDialog />);
    expect(screen.getByText("Allow tool?")).toBeTruthy();

    fireEvent.click(screen.getByText("Confirm"));
    await waitFor(() =>
      expect(respondToExtensionUi).toHaveBeenCalledWith({
        sessionId: "s1",
        requestId: "r1",
        response: { kind: "confirmed", confirmed: true },
      }),
    );
    // FIFO: the select dialog takes over once the confirm resolves.
    await waitFor(() => expect(screen.getByText("Pick one")).toBeTruthy());
  });

  it("answers a select by clicking an option", async () => {
    seed([{ requestId: "r1", kind: "select", title: "Pick one", options: ["alpha", "beta"] }]);
    render(<ExtensionRequestDialog />);
    fireEvent.click(screen.getByText("beta"));
    await waitFor(() =>
      expect(respondToExtensionUi).toHaveBeenCalledWith({
        sessionId: "s1",
        requestId: "r1",
        response: { kind: "value", value: "beta" },
      }),
    );
  });

  it("submits typed input", async () => {
    seed([{ requestId: "r1", kind: "input", title: "Name?", placeholder: "type here" }]);
    render(<ExtensionRequestDialog />);
    fireEvent.change(screen.getByPlaceholderText("type here"), { target: { value: "yui" } });
    fireEvent.click(screen.getByText("Submit"));
    await waitFor(() =>
      expect(respondToExtensionUi).toHaveBeenCalledWith({
        sessionId: "s1",
        requestId: "r1",
        response: { kind: "value", value: "yui" },
      }),
    );
  });

  it("cancels with the cancelled kind and clears the queue entry", async () => {
    seed([{ requestId: "r2", kind: "confirm", title: "Sure?", message: "..." }]);
    render(<ExtensionRequestDialog />);
    fireEvent.click(screen.getByText("Cancel"));
    await waitFor(() =>
      expect(respondToExtensionUi).toHaveBeenCalledWith({
        sessionId: "s1",
        requestId: "r2",
        response: { kind: "cancelled" },
      }),
    );
    expect(useChatStore.getState().extensionUi.pendingRequests).toEqual([]);
  });

  it("shows a countdown for expiring requests", () => {
    seed([
      {
        requestId: "r1",
        kind: "confirm",
        title: "Timed",
        message: "...",
        expiresAt: Date.now() + 30_000,
      },
    ]);
    render(<ExtensionRequestDialog />);
    expect(screen.getByText(/Auto-dismisses in \d+s/)).toBeTruthy();
  });

  it("prefills the editor draft", () => {
    seed([{ requestId: "r2", kind: "editor", title: "Edit", prefill: "hello" }]);
    render(<ExtensionRequestDialog />);
    expect(screen.getByDisplayValue("hello")).toBeTruthy();
  });
});
