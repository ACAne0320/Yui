import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useUiStore } from "@renderer/stores/ui-store";
import { WindowControls } from "./WindowControls";

describe("WindowControls", () => {
  beforeEach(() => {
    useUiStore.setState({ railCollapsed: false, spotlightOpen: false });
  });

  it("keeps every button inside the titlebar no-drag region", () => {
    const { container } = render(<WindowControls />);
    const titlebar = container.querySelector(".window-titlebar");

    expect(titlebar).toBeTruthy();
    for (const button of screen.getAllByRole("button")) {
      expect(button.closest(".window-titlebar")).toBe(titlebar);
      expect(button.closest(".win-controls")).toBeTruthy();
    }
  });

  it("keeps the sidebar toggle clickable", () => {
    render(<WindowControls />);

    fireEvent.click(screen.getByTitle("Collapse sidebar"));

    expect(useUiStore.getState().railCollapsed).toBe(true);
  });
});
