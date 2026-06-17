import { describe, expect, it } from "vitest";
import { toAppModel } from "./model-service.ts";

function piModel(overrides: Record<string, unknown> = {}) {
  return {
    id: "claude-x",
    name: "Claude X",
    api: "anthropic-messages",
    provider: "anthropic",
    baseUrl: "https://example",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200000,
    maxTokens: 8192,
    ...overrides,
  };
}

describe("toAppModel", () => {
  it("maps Pi model fields and derives thinking levels for a reasoning model", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const app = toAppModel(piModel() as any);
    expect(app).toMatchObject({
      providerId: "anthropic",
      modelId: "claude-x",
      name: "Claude X",
      reasoning: true,
      input: ["text", "image"],
      contextWindow: 200000,
      maxTokens: 8192,
    });
    expect(app.availableThinkingLevels.length).toBeGreaterThan(1);
  });

  it("reports a single 'off' level for a non-reasoning model", () => {
    const app = toAppModel(piModel({ reasoning: false }) as any);
    expect(app.availableThinkingLevels).toEqual(["off"]);
  });
});
