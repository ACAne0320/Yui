// Lightweight, language-agnostic text matching for persona memory dedup and
// recall. Uses character bigrams so it degrades gracefully for CJK (no word
// boundaries) as well as Latin scripts, without pulling in a tokenizer or
// embeddings — recall stays keyword/recency based per the spec.

/** Lowercase and strip whitespace + punctuation, keeping letters and numbers. */
export function normalizeForMatch(text: string): string {
  return text.toLowerCase().replaceAll(/[^\p{L}\p{N}]+/gu, "");
}

/** Character bigrams of the normalized text (single-char texts yield one gram). */
export function bigrams(text: string): Set<string> {
  const normalized = normalizeForMatch(text);
  const grams = new Set<string>();
  if (normalized.length === 0) return grams;
  if (normalized.length === 1) {
    grams.add(normalized);
    return grams;
  }
  for (let i = 0; i < normalized.length - 1; i += 1) {
    grams.add(normalized.slice(i, i + 2));
  }
  return grams;
}

/** Jaccard similarity of two bigram sets (1 when both empty, 0 when one is). */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const gram of a) {
    if (b.has(gram)) intersection += 1;
  }
  return intersection / (a.size + b.size - intersection);
}

/** Fraction of the query's bigrams that appear in the target text (0..1). */
export function coverage(query: string, target: string): number {
  const queryGrams = bigrams(query);
  if (queryGrams.size === 0) return 0;
  const targetGrams = bigrams(target);
  let hits = 0;
  for (const gram of queryGrams) {
    if (targetGrams.has(gram)) hits += 1;
  }
  return hits / queryGrams.size;
}
