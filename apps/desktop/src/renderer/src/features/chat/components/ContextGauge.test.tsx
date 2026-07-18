import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ContextUsage } from "@yui/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore } from "../store";
import { ContextGauge } from "./ContextGauge";

const getContextUsage = vi.fn<(input: unknown) => Promise<ContextUsage | undefined>>();

vi.mock("@renderer/lib/api", () => ({
  api: {
    agents: {
      getContextUsage: (input: unknown) => getContextUsage(input),
    },
  },
}));

function seed(sessionId: string | null) {
  useChatStore.setState({
    active: sessionId
      ? { sessionId, sessionPath: "/tmp/s.jsonl", title: "T", cwd: "/tmp", thinkingLevel: "medium" }
      : null,
    busy: false,
  });
}

beforeEach(() => {
  getContextUsage.mockReset().mockResolvedValue(undefined);
  seed(null);
});

describe("ContextGauge", () => {
  it("renders nothing without an active session", () => {
    const { container } = render(<ContextGauge />);
    expect(container.querySelector(".context-gauge")).toBeNull();
  });

  it("shows the ring for an active session and the numbers in its popover", async () => {
    getContextUsage.mockResolvedValue({ tokens: 158_000, contextWindow: 258_000, percent: 61.2 });
    seed("s1");
    const { container } = render(<ContextGauge />);

    const gauge = await waitFor(() => {
      const el = container.querySelector(".context-gauge");
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    // The ring fill reflects the percentage via stroke-dashoffset.
    const fill = container.querySelector(".context-gauge-fill") as SVGCircleElement;
    expect(fill).toBeTruthy();
    expect(Number(fill.style.strokeDashoffset)).toBeLessThan(20);

    fireEvent.click(gauge);
    expect(await screen.findByText("61% used")).toBeTruthy();
    expect(screen.getByText("158k / 258k")).toBeTruthy();
  });

  it("shows the unknown state when tokens are unavailable", async () => {
    getContextUsage.mockResolvedValue({ tokens: null, contextWindow: 200_000, percent: null });
    seed("s1");
    const { container } = render(<ContextGauge />);
    const gauge = await waitFor(() => {
      const el = container.querySelector(".context-gauge");
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    expect(gauge.getAttribute("data-state")).toBe("unknown");

    fireEvent.click(gauge);
    expect(await screen.findByText("Usage unknown")).toBeTruthy();
  });

  it("hides again after switching to a sessionless draft", async () => {
    getContextUsage.mockResolvedValue({ tokens: 1000, contextWindow: 200_000, percent: 0.5 });
    seed("s1");
    const { container, rerender } = render(<ContextGauge />);
    await waitFor(() => expect(container.querySelector(".context-gauge")).toBeTruthy());

    seed(null);
    rerender(<ContextGauge />);
    expect(container.querySelector(".context-gauge")).toBeNull();
  });
});
