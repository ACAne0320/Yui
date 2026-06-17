import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Markdown } from "./Markdown";

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
});
