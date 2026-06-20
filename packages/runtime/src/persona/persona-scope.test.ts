import { describe, expect, it } from "vitest";
import { resolvePersonaScope } from "./persona-scope.ts";

describe("resolvePersonaScope", () => {
  it("enables SOUL and both memory layers for normal sessions when config allows memory", () => {
    expect(resolvePersonaScope({ config: { memoryEnabled: true } })).toEqual({
      soul: true,
      globalMemory: true,
      cwdMemory: true,
    });
  });

  it("keeps SOUL but disables memory for memoryless sessions or session overrides", () => {
    expect(resolvePersonaScope({ config: { memoryEnabled: true }, kind: "memoryless" })).toEqual({
      soul: true,
      globalMemory: false,
      cwdMemory: false,
    });
    expect(resolvePersonaScope({ config: { memoryEnabled: true }, memory: false })).toEqual({
      soul: true,
      globalMemory: false,
      cwdMemory: false,
    });
  });

  it("does not let a session override re-enable globally disabled memory", () => {
    expect(resolvePersonaScope({ config: { memoryEnabled: false }, memory: true })).toEqual({
      soul: true,
      globalMemory: false,
      cwdMemory: false,
    });
  });

  it("resolves subagent scope without SOUL or global memory", () => {
    expect(resolvePersonaScope({ config: { memoryEnabled: true }, kind: "subagent" })).toEqual({
      soul: false,
      globalMemory: false,
      cwdMemory: true,
    });
    expect(resolvePersonaScope({ config: { memoryEnabled: false }, kind: "subagent" })).toEqual({
      soul: false,
      globalMemory: false,
      cwdMemory: true,
    });
  });
});
