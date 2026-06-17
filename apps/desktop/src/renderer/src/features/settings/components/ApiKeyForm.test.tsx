import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderStatus } from "@yui/contracts";
import { ApiKeyForm } from "./ApiKeyForm";

const setKey = vi.fn(async () => undefined);
const removeKey = vi.fn(async () => undefined);

vi.mock("@renderer/data/auth", () => ({
  useSetApiKey: () => ({ mutateAsync: setKey, isPending: false }),
  useRemoveApiKey: () => ({ mutateAsync: removeKey, isPending: false }),
}));

const base: ProviderStatus = {
  providerId: "openai",
  displayName: "OpenAI",
  configured: false,
  authMethods: ["api_key"],
  availableModelCount: 0,
};

beforeEach(() => {
  setKey.mockClear();
  removeKey.mockClear();
});

describe("ApiKeyForm", () => {
  it("saves a typed key when the field loses focus", async () => {
    render(<ApiKeyForm provider={base} formId="api-form" />);
    const input = screen.getByLabelText("API Key");
    fireEvent.change(input, { target: { value: "sk-test" } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(setKey).toHaveBeenCalledWith({ providerId: "openai", apiKey: "sk-test" }),
    );
    expect(removeKey).not.toHaveBeenCalled();
  });

  it("removes the credential when the stored key is cleared", async () => {
    const provider = { ...base, configured: true, authSource: "apiKey", apiKey: "sk-old" };
    render(<ApiKeyForm provider={provider} formId="api-form" />);
    const input = screen.getByLabelText("API Key");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    await waitFor(() => expect(removeKey).toHaveBeenCalledWith({ providerId: "openai" }));
    expect(setKey).not.toHaveBeenCalled();
  });

  it("does nothing when the field is blurred without changes", async () => {
    const provider = { ...base, configured: true, authSource: "apiKey", apiKey: "sk-old" };
    render(<ApiKeyForm provider={provider} formId="api-form" />);
    fireEvent.blur(screen.getByLabelText("API Key"));
    await Promise.resolve();
    expect(setKey).not.toHaveBeenCalled();
    expect(removeKey).not.toHaveBeenCalled();
  });
});
