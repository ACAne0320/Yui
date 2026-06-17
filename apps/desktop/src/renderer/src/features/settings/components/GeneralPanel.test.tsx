import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { changeLocale } from "@renderer/i18n";
import { GeneralPanel } from "./GeneralPanel";

afterEach(async () => {
  await changeLocale("en-US");
});

describe("GeneralPanel", () => {
  it("switches and persists the renderer language", async () => {
    await changeLocale("en-US");
    render(<GeneralPanel />);

    fireEvent.click(screen.getByText("简体中文"));

    await waitFor(() => expect(screen.getByText("语言")).toBeTruthy());
    expect(window.localStorage.getItem("yui.locale")).toBe("zh-CN");
    expect(document.documentElement.lang).toBe("zh-CN");
  });
});
