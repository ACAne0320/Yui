import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToolCard } from "./ToolCard";

/** The summary lives in the `<code>` next to the tool name in the header. */
function header(container: HTMLElement): string {
  return container.querySelector("button code")?.textContent ?? "";
}

describe("ToolCard header summary", () => {
  it("shows the bash command, not the result's first line", () => {
    const { container } = render(
      <ToolCard
        name="bash"
        args={{ command: "ls -la" }}
        detail={"total 296\nfile.txt"}
        running={false}
      />,
    );
    expect(header(container)).toBe("ls -la");
  });

  it("shows the command while the tool is still running", () => {
    const { container } = render(
      <ToolCard name="bash" args={{ command: "npm test" }} detail={"running…"} running />,
    );
    expect(header(container)).toBe("npm test");
  });

  it("uses the primary argument for non-bash tools (read/grep)", () => {
    const read = render(
      <ToolCard name="read" args={{ path: "src/app.ts" }} detail={"line 1"} running={false} />,
    );
    expect(header(read.container)).toBe("src/app.ts");

    const grep = render(
      <ToolCard
        name="grep"
        args={{ pattern: "TODO", path: "src" }}
        detail={"match"}
        running={false}
      />,
    );
    expect(header(grep.container)).toBe("TODO");
  });

  it("falls back to the result preview when no argument is captured", () => {
    const { container } = render(
      <ToolCard name="tool" args={undefined} detail={"first line\nsecond"} running={false} />,
    );
    expect(header(container)).toBe("first line");
  });
});
