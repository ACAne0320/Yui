import { afterEach, describe, expect, it } from "vitest";
import i18n, { changeLocale } from "./index";
import { enUS } from "./resources/en-US";
import { zhCN } from "./resources/zh-CN";

function leafKeys(value: object, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === "object" ? leafKeys(child, path) : [path];
  });
}

afterEach(async () => {
  await changeLocale("en-US");
});

describe("renderer i18n", () => {
  it("keeps English and Chinese resource keys aligned", () => {
    expect(leafKeys(zhCN).toSorted()).toEqual(leafKeys(enUS).toSorted());
  });

  it("falls back to English", () => {
    expect(i18n.t("common.unknownError", { lng: "fr" })).toBe(enUS.common.unknownError);
  });
});
