import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Markdown } from "./Markdown";

afterEach(() => {
  vi.useRealTimers();
});

describe("Markdown streaming word animation", () => {
  it("wraps paragraph words in stream-word spans while animated", () => {
    const { container } = render(<Markdown animated>Hello world</Markdown>);
    const words = [...container.querySelectorAll(".stream-word")].map((el) => el.textContent);
    expect(words).toEqual(["Hello", "world"]);
  });

  it("does not wrap words when not animated", () => {
    const { container } = render(<Markdown>Hello world</Markdown>);
    expect(container.querySelectorAll(".stream-word")).toHaveLength(0);
  });

  it("leaves table cell text un-wrapped so it does not flicker while streaming", () => {
    const table = "| Name | Value |\n| --- | --- |\n| Apple | 1 |";
    const { container } = render(<Markdown animated>{table}</Markdown>);
    // The table still renders with its text intact...
    expect(container.querySelector("table")).toBeTruthy();
    expect(container.textContent).toContain("Apple");
    // ...but none of its text is split into animated spans, so the wholesale
    // re-parse of the table block on each streamed token can't remount them.
    expect(container.querySelectorAll(".stream-word")).toHaveLength(0);
  });

  it("settles words past their fade so a remount can't replay the entrance flash", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const { container, rerender } = render(<Markdown animated>one two</Markdown>);
    // Freshly mounted words still animate — nothing is settled yet.
    expect(container.querySelectorAll(".stream-word.stream-settled")).toHaveLength(0);

    // Well past the fade window (SETTLE_MS), more text streams in.
    vi.setSystemTime(1000);
    rerender(<Markdown animated>one two three four</Markdown>);

    const settled = [...container.querySelectorAll(".stream-word")]
      .filter((el) => el.classList.contains("stream-settled"))
      .map((el) => el.textContent);
    // The original words drop their entrance (immune to a restructure remount);
    // the freshly appended tail keeps animating.
    expect(settled).toEqual(["one", "two"]);
  });
});
