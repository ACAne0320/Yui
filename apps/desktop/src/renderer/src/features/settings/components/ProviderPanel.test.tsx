import React from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { ProviderPanel } from "./ProviderPanel";

vi.mock("@renderer/data/auth", () => ({
  useBeginOAuthLogin: () => ({ mutateAsync: vi.fn(), data: undefined }),
  useCancelOAuthLogin: () => ({ mutateAsync: vi.fn() }),
  useOAuthLoginState: () => ({ data: undefined }),
  useRemoveApiKey: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRespondToOAuthLogin: () => ({ mutateAsync: vi.fn() }),
  useSetApiKey: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@renderer/data/settings", () => ({
  useSetDefaultModel: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const defaults = {};
const onSelect = vi.fn();
const renderPanel = (panel: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{panel}</QueryClientProvider>);

describe("ProviderPanel authentication methods", () => {
  it("shows subscription login without an API key field for OAuth-only providers", () => {
    renderPanel(
      <ProviderPanel
        providers={[
          {
            providerId: "openai-codex",
            displayName: "ChatGPT Plus/Pro (Codex Subscription)",
            configured: false,
            authMethods: ["oauth"],
            availableModelCount: 0,
          },
        ]}
        models={[]}
        defaults={defaults}
        selectedId="openai-codex"
        onSelect={onSelect}
      />,
    );

    expect(screen.getByText("Connect subscription")).toBeTruthy();
    expect(screen.queryByLabelText("API Key")).toBeNull();
  });

  it("shows both subscription and API key sections for dual-mode providers", () => {
    renderPanel(
      <ProviderPanel
        providers={[
          {
            providerId: "anthropic",
            displayName: "Anthropic",
            configured: false,
            authMethods: ["oauth", "api_key"],
            availableModelCount: 0,
          },
        ]}
        models={[]}
        defaults={defaults}
        selectedId="anthropic"
        onSelect={onSelect}
      />,
    );

    expect(screen.getByText("Connect subscription")).toBeTruthy();
    expect(screen.getByLabelText("API Key")).toBeTruthy();
  });
});
