import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Reasoning } from "./Reasoning";

/** The button's text content is the label alone — the icons are bare svgs. */
function label(container: HTMLElement): string {
  return container.querySelector(".reasoning > button")?.textContent ?? "";
}

describe("Reasoning gist label", () => {
  it("shows the thinking's first line as the collapsed label", () => {
    const { container } = render(
      <Reasoning text={"Let me check the repo layout\nThen read the docs"} streaming={false} />,
    );
    expect(label(container)).toBe("Let me check the repo layout");
    expect(container.querySelector(".reasoning > div")).toBeNull();
  });

  it("skips blank leading lines when picking the gist", () => {
    const { container } = render(<Reasoning text={"\n\nActual thought"} streaming={false} />);
    expect(label(container)).toBe("Actual thought");
  });

  it("expands to the full thinking on click", () => {
    const { container } = render(<Reasoning text={"gist\nfull body"} streaming={false} />);
    fireEvent.click(container.querySelector(".reasoning > button") as HTMLElement);
    expect(container.querySelector(".reasoning > div")?.textContent).toBe("gist\nfull body");
  });

  it("keeps the active label and auto-opens while streaming", () => {
    const { container } = render(<Reasoning text="still thinking" streaming />);
    expect(label(container)).toBe("Thinking…");
    expect(container.querySelector(".reasoning > div")?.textContent).toBe("still thinking");
  });
});
