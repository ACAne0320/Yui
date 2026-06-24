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
  it("shows only the final reply, folding intermediate prose into the disclosure", () => {
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
    expect(screen.getByText("first answer")).toBeTruthy();
    expect(screen.getByText("answer")).toBeTruthy();
    expect(container.querySelector(".thread-header span")?.textContent).toBe("2 turns");

    // The intermediate reply is tucked inside the collapsed disclosure; expanding
    // it reveals the same full prose, not a greyed-out thinking note.
    expect(screen.queryByText("checking")).toBeNull();
    fireEvent.click(container.querySelector(".process-chain > button") as HTMLElement);
    expect(screen.getByText("checking")).toBeTruthy();
  });

  it("nests reasoning and tool calls behind two layers of disclosure", () => {
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

    // Outer layer collapsed: only the final reply and the total-time summary show.
    expect(screen.getByText("All done")).toBeTruthy();
    expect(screen.getByText("Worked for 1m 5s")).toBeTruthy();
    expect(container.querySelectorAll(".tool-card")).toHaveLength(0);
    expect(screen.queryByText("View reasoning")).toBeNull();

    // Expand the outer layer: the tool call and the reasoning's own toggle appear,
    // but the reasoning text stays behind its inner collapse.
    fireEvent.click(screen.getByText("Worked for 1m 5s"));
    expect(container.querySelectorAll(".tool-card")).toHaveLength(1);
    expect(screen.getByText("View reasoning")).toBeTruthy();
    expect(screen.queryByText("Need to inspect the directory")).toBeNull();

    // Expand the inner reasoning layer: the thinking text finally shows.
    fireEvent.click(screen.getByText("View reasoning"));
    expect(screen.getByText("Need to inspect the directory")).toBeTruthy();
  });

  it("auto-expands the disclosure while the turn is running", () => {
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
        onOpenCwd={vi.fn()}
        composer={<div />}
      />,
    );

    // No click required: the disclosure is open while the model is working.
    expect(container.querySelector(".process-chain")?.getAttribute("data-open")).toBe("true");
    expect(container.querySelectorAll(".tool-card")).toHaveLength(1);
  });

  it("ticks the elapsed time on the disclosure summary while running", () => {
    vi.useFakeTimers();
    vi.setSystemTime(5_000);
    const assistant: AppMessage = {
      ...message("assistant-1", "assistant", ""),
      stopReason: "toolUse",
      content: [
        { type: "thinking", thinking: "Need to inspect the directory" },
        { type: "toolCall", id: "tool-1", name: "bash", arguments: { command: "pwd" } },
      ],
    };

    render(
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

    expect(screen.getByText("Working 4s")).toBeTruthy();
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByText("Working 5s")).toBeTruthy();

    vi.useRealTimers();
  });

  it("streams the final answer in place in its bubble, folding the disclosure on settle", () => {
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
    // stopReason yet — it streams in its own bubble (so the typing animation
    // plays in place), while the disclosure above shows the reasoning + tools.
    const streamingFinal = message("assistant-2", "assistant", "Here is the answer");
    const props = {
      active: null,
      liveTools: [],
      queue: [],
      activity: null,
      onOpenCwd: vi.fn(),
      composer: <div />,
    };
    const { container, rerender } = render(
      <Thread {...props} messages={[user, assistant, toolResult, streamingFinal]} busy />,
    );

    // Streaming: the answer is in its bubble (not inside the disclosure) with a
    // live caret and per-word fade-in spans; the disclosure stays open showing
    // the prior reasoning/tools.
    expect(container.querySelector(".process-chain")?.getAttribute("data-open")).toBe("true");
    expect(container.querySelector(".process-details .assistant-body")).toBeNull();
    expect(container.querySelector(".assistant-body")?.textContent).toContain("Here is the answer");
    expect(container.querySelector(".caret")).not.toBeNull();
    // The typing animation is on while it streams (gated on the live run, not on
    // a settled stopReason — providers set stopReason mid-stream).
    expect(container.querySelectorAll(".assistant-body .stream-word").length).toBeGreaterThan(0);

    // Run ends: the disclosure folds, the answer stays put, and the caret /
    // animation clear.
    rerender(
      <Thread
        {...props}
        messages={[user, assistant, toolResult, { ...streamingFinal, stopReason: "stop" }]}
        busy={false}
        messageStats={{ "assistant-2": { runMs: 3_000 } }}
      />,
    );
    expect(container.querySelector(".process-chain")?.getAttribute("data-open")).toBe("false");
    expect(container.querySelector(".process-details")).toBeNull();
    expect(container.querySelector(".assistant-body")?.textContent).toBe("Here is the answer");
    expect(container.querySelector(".caret")).toBeNull();
    expect(container.querySelectorAll(".assistant-body .stream-word")).toHaveLength(0);
  });

  it("keeps the summary counting after the reply settles, then shows the final time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(5_000);
    const user = { ...message("user-1", "user", "run pwd"), timestamp: 1_000 };
    const assistant: AppMessage = {
      ...message("assistant-1", "assistant", ""),
      stopReason: "toolUse",
      content: [{ type: "toolCall", id: "tool-1", name: "bash", arguments: { command: "pwd" } }],
    };
    const toolResult: AppMessage = {
      ...message("result-1", "toolResult", "done"),
      toolCallId: "tool-1",
      toolName: "bash",
    };
    const settledFinal: AppMessage = {
      ...message("assistant-2", "assistant", "All done"),
      stopReason: "stop",
    };
    const props = {
      active: null,
      liveTools: [],
      queue: [],
      activity: null,
      runStartedAt: 1_000,
      onOpenCwd: vi.fn(),
      composer: <div />,
    };

    // Reply has settled but the run has not ended yet: the disclosure folds, but
    // the summary keeps ticking instead of blanking the time (runMs isn't ready).
    const { container, rerender } = render(
      <Thread {...props} messages={[user, assistant, toolResult, settledFinal]} busy />,
    );
    expect(container.querySelector(".process-chain")?.getAttribute("data-open")).toBe("false");
    expect(screen.getByText("Working 4s")).toBeTruthy();

    // Run ends: the summary switches to the final measured duration.
    rerender(
      <Thread
        {...props}
        messages={[user, assistant, toolResult, settledFinal]}
        busy={false}
        messageStats={{ "assistant-2": { runMs: 7_000 } }}
      />,
    );
    expect(screen.getByText("Worked for 7s")).toBeTruthy();

    vi.useRealTimers();
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
});
