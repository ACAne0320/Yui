import { afterEach, describe, expect, it } from "vitest";
import { changeLocale } from "@renderer/i18n";
import { formatError, formatTokenCount } from "./format";

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

describe("formatTokenCount", () => {
  it("compacts thousands to k and millions to M", () => {
    expect(formatTokenCount(860)).toBe("860");
    expect(formatTokenCount(128_540)).toBe("129k");
    expect(formatTokenCount(1_049_000)).toBe("1M");
    expect(formatTokenCount(1_600_000)).toBe("1.6M");
  });
});
