import { afterEach, describe, expect, it } from "vitest";
import { changeLocale } from "@renderer/i18n";
import { formatError } from "./format";

afterEach(async () => {
  await changeLocale("en-US");
});

describe("formatError", () => {
  it("localizes stable application error codes", async () => {
    expect(formatError({ code: "unknown_model", message: "raw runtime message" })).toBe(
      "The selected model is not available.",
    );

    await changeLocale("zh-CN");

    expect(formatError({ code: "unknown_model", message: "raw runtime message" })).toBe(
      "所选模型不可用。",
    );
  });
});
