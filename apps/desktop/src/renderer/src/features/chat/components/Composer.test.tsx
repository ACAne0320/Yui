import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Composer } from "./Composer";

function props() {
  return {
    input: "",
    onInput: vi.fn(),
    onSend: vi.fn(async () => undefined),
    attachments: [],
    onAddFiles: vi.fn(),
    onRemoveAttachment: vi.fn(),
    imagesSupported: false,
    models: [],
    selectedModelKey: "",
    onModel: vi.fn(),
    cwds: ["/tmp"],
    cwd: "/tmp",
    usingTemp: false,
    onCwd: vi.fn(),
    onBrowseCwd: vi.fn(async () => undefined),
    thinking: "medium" as const,
    onThinking: vi.fn(),
    noMemory: false,
    onToggleNoMemory: vi.fn(),
  };
}

describe("Composer", () => {
  it("sends on Enter and keeps Shift+Enter for a newline", () => {
    const input = props();
    render(<Composer {...input} input="hello" />);
    const textarea = screen.getByPlaceholderText("Say anything…");
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(input.onSend).toHaveBeenCalledOnce();
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(input.onSend).toHaveBeenCalledOnce();
  });

  it("does not send when Enter confirms IME composition", () => {
    vi.useFakeTimers();
    const input = props();
    render(<Composer {...input} input="ask" />);
    const textarea = screen.getByPlaceholderText("Say anything…");

    fireEvent.compositionStart(textarea);
    fireEvent.keyDown(textarea, { key: "Enter", isComposing: true });
    expect(input.onSend).not.toHaveBeenCalled();

    fireEvent.compositionEnd(textarea);
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(input.onSend).not.toHaveBeenCalled();

    vi.runAllTimers();
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(input.onSend).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("disables send for empty input and shows the busy placeholder", () => {
    render(<Composer {...props()} busy />);
    expect((screen.getByTitle("Send") as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByPlaceholderText("Add a follow-up to run after the current response…"),
    ).toBeTruthy();
  });

  it("enables send for an image-only draft with no text", () => {
    render(
      <Composer
        {...props()}
        imagesSupported
        attachments={[
          { id: "a1", name: "shot.png", mimeType: "image/png", base64: "x", objectUrl: "blob:1" },
        ]}
      />,
    );
    expect((screen.getByTitle("Send") as HTMLButtonElement).disabled).toBe(false);
  });

  it("keeps the attach button enabled regardless of image support", () => {
    render(<Composer {...props()} imagesSupported={false} />);
    expect((screen.getByTitle("Attach image") as HTMLButtonElement).disabled).toBe(false);
  });

  it("warns, but does not block, when attaching to a model without image support", () => {
    const attachments = [
      { id: "a1", name: "shot.png", mimeType: "image/png", base64: "x", objectUrl: "blob:1" },
    ];
    const { rerender } = render(
      <Composer {...props()} imagesSupported={false} attachments={attachments} />,
    );
    expect(screen.getByText(/can't read images/i)).toBeTruthy();
    rerender(<Composer {...props()} imagesSupported attachments={attachments} />);
    expect(screen.queryByText(/can't read images/i)).toBeNull();
  });

  it("adds pasted image files even when the model lacks image support", () => {
    const file = new File(["x"], "shot.png", { type: "image/png" });
    const input = props();
    render(<Composer {...input} imagesSupported={false} />);
    fireEvent.paste(screen.getByPlaceholderText("Say anything…"), {
      clipboardData: { files: [file] },
    });
    expect(input.onAddFiles).toHaveBeenCalledOnce();
  });

  it("previews attachments and removes one on click", () => {
    const input = props();
    render(
      <Composer
        {...input}
        imagesSupported
        attachments={[
          { id: "a1", name: "shot.png", mimeType: "image/png", base64: "x", objectUrl: "blob:1" },
        ]}
      />,
    );
    expect((screen.getByAltText("shot.png") as HTMLImageElement).src).toContain("blob:1");
    fireEvent.click(screen.getByTitle("Remove"));
    expect(input.onRemoveAttachment).toHaveBeenCalledWith("a1");
  });
});
