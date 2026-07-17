import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ToolSegment } from "../lib";
import { ToolGroup } from "./ToolGroup";

const tool = (id: string, overrides: Partial<ToolSegment> = {}): ToolSegment => ({
  kind: "tool",
  id,
  name: "bash",
  args: { command: `cmd-${id}` },
  detail: "ok",
  running: false,
  ...overrides,
});

describe("ToolGroup", () => {
  it("stays folded by default, summarizing an all-bash run as commands", () => {
    const { container } = render(<ToolGroup tools={[tool("a"), tool("b"), tool("c")]} />);
    expect(container.querySelector(".tool-group")?.getAttribute("data-open")).toBe("false");
    expect(container.querySelector(".tool-group-summary")?.textContent).toBe("Ran 3 commands");
    expect(container.querySelectorAll(".tool-card")).toHaveLength(0);
  });

  it("summarizes a mixed run as tool uses", () => {
    const { container } = render(
      <ToolGroup tools={[tool("a"), tool("b", { name: "read", args: { path: "x.ts" } })]} />,
    );
    expect(container.querySelector(".tool-group-summary")?.textContent).toBe("Used 2 tools");
  });

  it("expands to the per-tool rows on click and folds back", () => {
    const { container } = render(<ToolGroup tools={[tool("a"), tool("b")]} />);
    const header = container.querySelector(".tool-group > button") as HTMLElement;
    fireEvent.click(header);
    expect(container.querySelectorAll(".tool-card")).toHaveLength(2);
    expect(container.querySelector(".tool-group")?.getAttribute("data-open")).toBe("true");
    fireEvent.click(header);
    expect(container.querySelectorAll(".tool-card")).toHaveLength(0);
  });

  it("shows a spinner and the active command inline while running", () => {
    const { container } = render(
      <ToolGroup
        tools={[tool("a"), tool("b", { running: true, args: { command: "npm test" } })]}
      />,
    );
    expect(container.querySelector(".tool-group")?.getAttribute("data-running")).toBe("true");
    expect(container.querySelector(".spinner")).not.toBeNull();
    expect(container.querySelector(".tool-group > button code")?.textContent).toContain("npm test");
  });

  it("surfaces an error on the folded row when any tool failed", () => {
    const { container } = render(<ToolGroup tools={[tool("a", { error: true }), tool("b")]} />);
    expect(container.querySelector(".tool-group")?.getAttribute("data-error")).toBe("true");
  });
});
