import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Markdown } from "./Markdown";

describe("Markdown streaming rendering", () => {
  it("wraps streamed text in animate spans while animated", () => {
    const { container } = render(<Markdown animated>你好 world</Markdown>);
    const animated = [...container.querySelectorAll("[data-sd-animate]")];
    expect(animated.length).toBeGreaterThan(0);
    expect(animated.map((el) => el.textContent).join("")).toContain("你好");
  });

  it("renders no animate spans when static", () => {
    const { container } = render(<Markdown>你好 world</Markdown>);
    expect(container.querySelectorAll("[data-sd-animate]")).toHaveLength(0);
  });

  it("repairs unterminated bold while streaming, so structure never flips mid-sentence", () => {
    // The old pipeline rendered `**加粗` as literal text until the closing `**`
    // arrived, then flipped it into <strong> — remounting and replaying the
    // entrance. remend closes it up front, so it is bold from the first token.
    const { container } = render(<Markdown animated>{"**加粗仍在输入"}</Markdown>);
    expect(container.querySelector("strong")?.textContent).toContain("加粗仍在输入");
  });

  it("leaves unterminated syntax literal in static mode", () => {
    const { container } = render(<Markdown>{"**加粗仍在输入"}</Markdown>);
    expect(container.querySelector("strong")).toBeNull();
    expect(container.textContent).toContain("**加粗仍在输入");
  });

  it("renders tables with their text intact", () => {
    const table = "| Name | Value |\n| --- | --- |\n| Apple | 1 |";
    const { container } = render(<Markdown animated>{table}</Markdown>);
    expect(container.querySelector("table")).toBeTruthy();
    expect(container.textContent).toContain("Apple");
  });

  it("renders fenced code as a code block and keeps animate spans out of it", () => {
    const { container } = render(<Markdown animated>{"```bash\nls -la\n```"}</Markdown>);
    expect(container.querySelector(".md-code")).toBeTruthy();
    expect(container.querySelector(".md-code [data-sd-animate]")).toBeNull();
  });

  it("fades a new block in instead of popping it when it follows settled prose", () => {
    // Regression: Streamdown shares one animate plugin across blocks by
    // default, so a new quote/list block inherited the prose block's settled
    // count and its characters appeared with duration 0 (the visible "quote
    // pops in after the prose" stutter). Our per-block AnimatedBlock keeps the
    // counts isolated — every new character fades in.
    const { container, rerender } = render(<Markdown animated>前文</Markdown>);
    rerender(<Markdown animated>{"前文\n\n> 引用内容"}</Markdown>);
    const durations = [...container.querySelectorAll("blockquote [data-sd-animate]")].map((el) =>
      (el as HTMLElement).style.getPropertyValue("--sd-duration"),
    );
    expect(durations.length).toBeGreaterThan(0);
    expect(durations.every((duration) => duration === "150ms")).toBe(true);
  });

  it("fades the first bold character in rather than popping it after plain text", () => {
    const { container, rerender } = render(<Markdown animated>正常文字</Markdown>);
    rerender(<Markdown animated>正常文字**加</Markdown>);
    const bold = container.querySelector("strong [data-sd-animate]") as HTMLElement | null;
    expect(bold?.textContent).toBe("加");
    expect(bold?.style.getPropertyValue("--sd-duration")).toBe("150ms");
  });

  it("freezes each character's style at first sight so a re-parse never replays it", () => {
    const { container, rerender } = render(<Markdown animated>前文</Markdown>);
    const before = [...container.querySelectorAll("[data-sd-animate]")].map((el) =>
      (el as HTMLElement).getAttribute("style"),
    );
    rerender(<Markdown animated>前文继续</Markdown>);
    const spans = [...container.querySelectorAll("[data-sd-animate]")];
    // Already-visible characters keep the exact same style (duration AND delay)
    // — React reuses their DOM nodes, so the entrance never replays.
    expect(spans.slice(0, 2).map((el) => el.getAttribute("style"))).toEqual(before);
    // The newly appended characters fade with a fresh per-batch cascade.
    expect(
      spans.slice(2).map((el) => (el as HTMLElement).style.getPropertyValue("--sd-duration")),
    ).toEqual(["150ms", "150ms"]);
  });

  it("streams inline code per character instead of popping it ahead of the prose", () => {
    // Streamdown's own animate pass skips `code` subtrees; ours skips only
    // `pre`, so inline code fades in per character like the prose around it.
    // (Whitespace between words stays a plain text node, as in the prose.)
    const { container } = render(<Markdown animated>{"守门 `translate check` 完成"}</Markdown>);
    const chars = [...container.querySelectorAll("code [data-sd-animate]")].map(
      (el) => el.textContent,
    );
    expect(chars.join("")).toBe("translatecheck");
    expect(container.querySelector("code")?.textContent).toBe("translate check");
  });

  it("leaves inline code unwrapped when static", () => {
    const { container } = render(<Markdown>{"守门 `translate check` 完成"}</Markdown>);
    expect(container.querySelectorAll("code [data-sd-animate]")).toHaveLength(0);
    expect(container.querySelector("code")?.textContent).toBe("translate check");
  });
});
