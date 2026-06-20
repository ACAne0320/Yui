import type { MemoryEntry, MemoryScope, PersonaScope } from "@yui/contracts";
import type { PersonaStore } from "./persona-store.ts";

/**
 * Per-scope character budget for the injected index. Entries are recency-first,
 * so the newest fit and the rest are summarized as "use recall". This is only a
 * default cap — real curation (merge/dedup/eviction) belongs to the future dream
 * system, not the open-time injection.
 */
const SCOPE_CHAR_BUDGET = 1600;

const MEMORY_INTRO =
  "You have persistent memory across sessions. Use the `recall` tool to search full or older " +
  "entries, and the `remember` tool to save durable facts worth keeping. Recent entries:";
const READ_ONLY_MEMORY_INTRO =
  "You have read-only persistent memory across sessions. Use the `recall` tool to search full or " +
  "older entries. Do not save new memories from this context. Recent entries:";

export interface PersonaSystemPromptOptions {
  /** Memory is visible and searchable, but no write tool is registered. */
  memoryReadOnly?: boolean;
}

export async function buildPersonaSystemPrompt(
  store: PersonaStore,
  scope: PersonaScope,
  cwd?: string,
  options: PersonaSystemPromptOptions = {},
): Promise<string | undefined> {
  const sections: string[] = [];

  if (scope.soul) {
    const soul = (await safe(() => store.getSoul()))?.content.trim();
    if (soul) sections.push(`## SOUL\n\n${soul}`);
  }

  const memory = await buildMemorySection(store, scope, cwd, options);
  if (memory) sections.push(memory);

  return sections.length > 0 ? sections.join("\n\n") : undefined;
}

async function buildMemorySection(
  store: PersonaStore,
  scope: PersonaScope,
  cwd: string | undefined,
  options: PersonaSystemPromptOptions,
): Promise<string | undefined> {
  const blocks: string[] = [];
  if (scope.globalMemory) {
    const block = formatScopeBlock(
      "Global — user preferences & base facts",
      await safeList(store, "global"),
    );
    if (block) blocks.push(block);
  }
  if (scope.cwdMemory && cwd) {
    const block = formatScopeBlock(
      "Project — this working directory",
      await safeList(store, "cwd", cwd),
    );
    if (block) blocks.push(block);
  }

  // No memory layer active for this session: omit the section entirely (the
  // tools are not registered either, so advertising memory would mislead).
  if (!scope.globalMemory && !scope.cwdMemory) return undefined;

  const body = blocks.length > 0 ? blocks.join("\n\n") : "(no saved memories yet)";
  const intro = options.memoryReadOnly ? READ_ONLY_MEMORY_INTRO : MEMORY_INTRO;
  return `## Memory\n\n${intro}\n\n${body}`;
}

function formatScopeBlock(title: string, entries: MemoryEntry[]): string | undefined {
  if (entries.length === 0) return undefined;
  const lines: string[] = [];
  let used = 0;
  let truncated = false;
  for (const entry of entries) {
    const line = `- ${entry.description.trim() || entry.name.trim()}`;
    if (used + line.length > SCOPE_CHAR_BUDGET && lines.length > 0) {
      truncated = true;
      break;
    }
    lines.push(line);
    used += line.length + 1;
  }
  if (truncated) lines.push("- …older entries omitted; use `recall` to retrieve them.");
  return `### ${title}\n${lines.join("\n")}`;
}

async function safeList(
  store: PersonaStore,
  scope: MemoryScope,
  cwd?: string,
): Promise<MemoryEntry[]> {
  return (await safe(() => store.listMemoryEntries(scope, cwd))) ?? [];
}

async function safe<T>(operation: () => Promise<T>): Promise<T | undefined> {
  try {
    return await operation();
  } catch {
    return undefined;
  }
}
