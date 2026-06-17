import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AppMessage } from "@yui/contracts";
import { Thread } from "./Thread";

function message(id: string, role: AppMessage["role"], text: string): AppMessage {
  return {
    id,
    role,
    content: [{ type: "text", text }],
    model: role === "assistant" ? "model-id" : undefined,
    timestamp: 1,
  };
}

describe("Thread", () => {
  it("renders each user request with one clean final reply", () => {
    const { container } = render(
      <Thread
        active={null}
        messages={[
          message("user-1", "user", "first"),
          { ...message("assistant-1", "assistant", "checking"), stopReason: "toolUse" },
          message("assistant-2", "assistant", "first answer"),
          message("user-2", "user", "second"),
          message("assistant-3", "assistant", "answer"),
        ]}
        liveTools={[]}
        queue={[]}
        activity={null}
        busy={false}
        onOpenCwd={vi.fn()}
        composer={<div />}
      />,
    );

    expect(container.querySelectorAll(".assistant-meta")).toHaveLength(0);
    expect(screen.queryByText("checking")).toBeNull();
    expect(screen.getByText("first answer")).toBeTruthy();
    expect(screen.getByText("answer")).toBeTruthy();
    expect(container.querySelector(".thread-header span")?.textContent).toBe("2 turns");
  });

  it("collapses reasoning and tool calls into the execution chain", () => {
    const assistant: AppMessage = {
      ...message("assistant-1", "assistant", ""),
      stopReason: "toolUse",
      content: [
        { type: "thinking", thinking: "Need to inspect the directory" },
        { type: "toolCall", id: "tool-1", name: "bash", arguments: { command: "pwd" } },
      ],
    };
    const toolResult: AppMessage = {
      ...message("result-1", "toolResult", "done"),
      toolCallId: "tool-1",
      toolName: "bash",
    };
    const final = { ...message("assistant-2", "assistant", "All done"), completedAt: 66_000 };
    const { container } = render(
      <Thread
        active={null}
        messages={[
          { ...message("user-1", "user", "run pwd"), timestamp: 1_000 },
          assistant,
          toolResult,
          final,
        ]}
        liveTools={[]}
        queue={[]}
        activity={null}
        busy={false}
        onOpenCwd={vi.fn()}
        composer={<div />}
      />,
    );

    expect(screen.getByText("Ran for 1m 5s")).toBeTruthy();
    expect(container.querySelectorAll(".tool-card")).toHaveLength(0);
    expect(screen.queryByText("Need to inspect the directory")).toBeNull();

    fireEvent.click(screen.getByText("Ran for 1m 5s"));
    expect(container.querySelectorAll(".tool-card")).toHaveLength(1);
    expect(screen.getByText("Need to inspect the directory")).toBeTruthy();
    expect(screen.queryByText("Reasoning")).toBeNull();
    expect(screen.getByText("All done")).toBeTruthy();
  });

  it("expands the reasoning and tool stream while the turn is running", () => {
    const assistant: AppMessage = {
      ...message("assistant-1", "assistant", ""),
      stopReason: "toolUse",
      content: [
        { type: "thinking", thinking: "Need to inspect the directory" },
        { type: "toolCall", id: "tool-1", name: "bash", arguments: { command: "pwd" } },
      ],
    };
    const { container } = render(
      <Thread
        active={null}
        messages={[{ ...message("user-1", "user", "run pwd"), timestamp: 1_000 }, assistant]}
        liveTools={[
          { toolCallId: "tool-1", name: "bash", args: { command: "pwd" }, running: true },
        ]}
        queue={[]}
        activity={null}
        busy
        runStartedAt={1_000}
        onOpenCwd={vi.fn()}
        composer={<div />}
      />,
    );

    // No click required: the stream is expanded while the model is working.
    expect(container.querySelector(".execution-chain")?.getAttribute("data-open")).toBe("true");
    expect(container.querySelectorAll(".tool-card")).toHaveLength(1);
    expect(screen.getByText("Need to inspect the directory")).toBeTruthy();
  });

  it("streams the final answer inside the chain, then folds and lifts it to the bubble on settle", () => {
    const assistant: AppMessage = {
      ...message("assistant-1", "assistant", ""),
      stopReason: "toolUse",
      content: [
        { type: "thinking", thinking: "Need to inspect the directory" },
        { type: "toolCall", id: "tool-1", name: "bash", arguments: { command: "pwd" } },
      ],
    };
    const toolResult: AppMessage = {
      ...message("result-1", "toolResult", "done"),
      toolCallId: "tool-1",
      toolName: "bash",
    };
    const user = { ...message("user-1", "user", "run pwd"), timestamp: 1_000 };
    // The final reply has begun streaming: text present, no tool call, no
    // stopReason yet. Until it settles it streams inside the open chain (so a
    // pre-tool-call preamble could never flash into the bubble first).
    const streamingFinal = message("assistant-2", "assistant", "Here is the answer");
    const props = {
      active: null,
      liveTools: [],
      queue: [],
      activity: null,
      runStartedAt: 1_000,
      onOpenCwd: vi.fn(),
      composer: <div />,
    };
    const { container, rerender } = render(
      <Thread {...props} messages={[user, assistant, toolResult, streamingFinal]} busy />,
    );

    // Streaming: chain stays open, reply renders in it without the "Intermediate
    // reply" label, and the answer bubble has not appeared yet.
    expect(container.querySelector(".execution-chain")?.getAttribute("data-open")).toBe("true");
    expect(container.querySelector(".assistant-body")).toBeNull();
    const live = container.querySelector(".execution-intermediate");
    expect(live?.querySelector("strong")).toBeNull();
    expect(live?.textContent).toContain("Here is the answer");

    // Settling its stopReason (still busy) folds the chain and lifts the reply
    // into the bubble — the relocation happens once, when it is truly final.
    rerender(
      <Thread
        {...props}
        messages={[user, assistant, toolResult, { ...streamingFinal, stopReason: "stop" }]}
        busy
      />,
    );
    expect(container.querySelector(".execution-chain")?.getAttribute("data-open")).toBe("false");
    expect(container.querySelector(".assistant-body")?.textContent).toBe("Here is the answer");
  });

  it("shows a button to jump back to the latest message after scrolling up", () => {
    const { container } = render(
      <Thread
        active={null}
        messages={[message("user-1", "user", "hello"), message("assistant-1", "assistant", "hi")]}
        liveTools={[]}
        queue={[]}
        activity={null}
        busy={false}
        onOpenCwd={vi.fn()}
        composer={<div />}
      />,
    );
    const thread = container.querySelector(".thread") as HTMLDivElement;
    const scrollTo = vi.fn();
    Object.defineProperties(thread, {
      scrollHeight: { configurable: true, value: 1_000 },
      clientHeight: { configurable: true, value: 400 },
      scrollTop: { configurable: true, writable: true, value: 100 },
      scrollTo: { configurable: true, value: scrollTo },
    });

    fireEvent.scroll(thread);
    const button = screen.getByRole("button", { name: "Jump to latest message" });
    fireEvent.click(button);

    expect(scrollTo).toHaveBeenCalledWith({ top: 1_000, behavior: "smooth" });
    expect(screen.queryByRole("button", { name: "Jump to latest message" })).toBeNull();
  });

  it("updates the elapsed duration while the active request is running", () => {
    vi.useFakeTimers();
    vi.setSystemTime(5_000);

    render(
      <Thread
        active={null}
        messages={[{ ...message("user-1", "user", "work"), timestamp: 1_000 }]}
        liveTools={[]}
        queue={[]}
        activity={null}
        busy
        runStartedAt={1_000}
        onOpenCwd={vi.fn()}
        composer={<div />}
      />,
    );

    expect(screen.getByText("Running for 4s")).toBeTruthy();
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByText("Running for 5s")).toBeTruthy();

    vi.useRealTimers();
  });
});
