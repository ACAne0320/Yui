import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AppMessage } from "@yui/contracts";
import { Message } from "./Message";

function message(role: AppMessage["role"], text: string): AppMessage {
  return {
    id: `${role}-1`,
    role,
    content: [{ type: "text", text }],
    timestamp: 1,
  };
}

describe("Message", () => {
  it("renders user messages", () => {
    render(<Message message={message("user", "hello")} streaming={false} />);
    expect(screen.getByText("hello")).toBeTruthy();
  });

  it("renders assistant markdown", () => {
    const { container } = render(
      <Message message={message("assistant", "**strong**")} streaming={false} />,
    );
    expect(container.querySelector(".markdown strong")?.textContent).toBe("strong");
  });

  it("can hide assistant metadata for later messages in a turn", () => {
    render(
      <Message
        message={{ ...message("assistant", "later"), model: "model-id" }}
        streaming={false}
        showAssistantMeta={false}
      />,
    );
    expect(screen.queryByText("Yui")).toBeNull();
    expect(screen.queryByText("model-id")).toBeNull();
    expect(screen.getByText("later")).toBeTruthy();
  });

  it("leaves assistant tool calls to live tools and tool results", () => {
    const assistant: AppMessage = {
      ...message("assistant", ""),
      content: [{ type: "toolCall", id: "tool-1", name: "bash", arguments: { command: "pwd" } }],
    };
    const { container } = render(<Message message={assistant} streaming={false} />);
    expect(container.querySelectorAll(".tool-card")).toHaveLength(0);
  });

  it("renders a failed run's error message", () => {
    const errored: AppMessage = {
      ...message("assistant", ""),
      stopReason: "error",
      errorMessage: "401 Unauthorized",
    };
    const { container } = render(<Message message={errored} streaming={false} />);
    expect(container.querySelector(".message-error")?.textContent).toBe("401 Unauthorized");
  });

  it("falls back to a generic message when an errored run carries no error text", () => {
    const errored: AppMessage = { ...message("assistant", ""), stopReason: "error" };
    const { container } = render(<Message message={errored} streaming={false} />);
    expect(container.querySelector(".message-error")?.textContent).toBe(
      "The request failed. Check the provider settings or API key.",
    );
  });

  it("renders tool results and system messages", () => {
    const tool = { ...message("toolResult", "done"), toolName: "read" };
    const { rerender } = render(<Message message={tool} streaming={false} />);
    expect(screen.getByText("read")).toBeTruthy();
    rerender(<Message message={message("compactionSummary", "summary")} streaming={false} />);
    expect(screen.getByText("Context compacted")).toBeTruthy();
  });
});
