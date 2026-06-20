import { describe, expect, it } from "vitest";
import { bigrams, coverage, jaccard } from "./text-match.ts";

describe("text-match", () => {
  it("scores near-identical strings high and unrelated strings low", () => {
    expect(jaccard(bigrams("dark mode"), bigrams("dark mode!"))).toBeGreaterThan(0.7);
    expect(jaccard(bigrams("dark mode"), bigrams("rust language"))).toBeLessThan(0.2);
  });

  it("measures query coverage against a target", () => {
    expect(coverage("concise", "User prefers concise answers")).toBe(1);
    expect(coverage("xyzzy", "User prefers concise answers")).toBeLessThan(0.5);
  });

  it("handles CJK text via character bigrams", () => {
    expect(jaccard(bigrams("喜欢简洁"), bigrams("喜欢简洁的回答"))).toBeGreaterThan(0.3);
    expect(coverage("简洁", "喜欢简洁的回答")).toBe(1);
  });
});
