// Built-in `remember` / `recall` tools that let the chat model read and write
// Yui's persistent persona memory. Registration is gated per session by
// PersonaScope: a session with memory disabled (global toggle off or a
// "no-memory" session) gets neither tool, so the model never sees an inert
// capability. The model chooses the scope for each `remember` (global = user
// preferences / base facts; cwd = this project's details).

import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import { defineTool } from "@earendil-works/pi-coding-agent";
import type { MemoryEntry, MemoryScope, PersonaScope } from "@yui/contracts";
import { Type } from "typebox";
import type { PersonaStore } from "./persona-store.ts";

/** Per-entry content cap in a recall result, so the tool stays cheap. */
const RECALL_CONTENT_CHARS = 1200;

export interface RememberDetails {
  /** Absent only on the defensive "scope disabled" error path. */
  entry?: MemoryEntry;
  updated: boolean;
}

export interface RecallDetails {
  matches: MemoryEntry[];
}

export interface MemoryToolsOptions {
  store: PersonaStore;
  /** Authoritative session working directory, for `cwd`-scoped memory. */
  cwd: string;
  /** Which memory layers this session may touch. */
  scope: PersonaScope;
  /** Register read tools only; useful for isolated workers that must not persist task state. */
  readOnly?: boolean;
}

const rememberParameters = Type.Object({
  text: Type.String({
    description:
      "The fact to remember, in one self-contained sentence (e.g. a preference, a project detail).",
  }),
  scope: Type.Union([Type.Literal("global"), Type.Literal("cwd")], {
    description:
      "global = user preferences and base facts that apply everywhere; cwd = details specific to " +
      "this working directory / project. Choose deliberately.",
  }),
  tags: Type.Optional(Type.Array(Type.String(), { description: "Optional short topic tags." })),
});

const recallParameters = Type.Object({
  query: Type.String({ description: "What to search saved memories for." }),
  scope: Type.Optional(
    Type.Union([Type.Literal("global"), Type.Literal("cwd")], {
      description: "Restrict the search to one scope. Omit to search all enabled scopes.",
    }),
  ),
});

/** Tools for this session's enabled memory scopes (empty when none enabled). */
export function createMemoryTools(options: MemoryToolsOptions) {
  const { store, cwd, scope } = options;
  if (!scope.globalMemory && !scope.cwdMemory) return [];

  const allowed: MemoryScope[] = [
    ...(scope.globalMemory ? (["global"] as const) : []),
    ...(scope.cwdMemory ? (["cwd"] as const) : []),
  ];

  const remember = defineTool<typeof rememberParameters, RememberDetails>({
    name: "remember",
    label: "Remember",
    description:
      "Save a durable fact to persistent memory so it is available in future sessions. Use it when " +
      "you learn a stable preference, decision, or project detail worth keeping — not for transient " +
      "task state. Near-duplicates of an existing memory update it instead of piling up.",
    promptSnippet: "remember: save a durable fact (global or cwd) to persistent memory",
    parameters: rememberParameters,
    async execute(_toolCallId, params): Promise<AgentToolResult<RememberDetails>> {
      const target = params.scope;
      if (!allowed.includes(target)) {
        return {
          content: [
            {
              type: "text",
              text: `Cannot remember: ${target} memory is not enabled for this session.`,
            },
          ],
          details: { updated: false },
        };
      }
      const { entry, updated } = await store.rememberMemory({
        scope: target,
        cwd: target === "cwd" ? cwd : undefined,
        text: params.text,
        tags: params.tags,
      });
      return {
        content: [
          {
            type: "text",
            text: `${updated ? "Updated" : "Saved"} ${target} memory: ${entry.name}`,
          },
        ],
        details: { entry, updated },
      };
    },
  });

  const recall = defineTool<typeof recallParameters, RecallDetails>({
    name: "recall",
    label: "Recall",
    description:
      "Search persistent memory for saved facts by keyword. Returns the closest matching entries " +
      "with their full content. Use it before assuming you have forgotten something the user told " +
      "you earlier.",
    promptSnippet: "recall: search persistent memory for saved facts",
    parameters: recallParameters,
    async execute(_toolCallId, params): Promise<AgentToolResult<RecallDetails>> {
      if (params.scope && !allowed.includes(params.scope)) {
        return {
          content: [
            {
              type: "text",
              text: `Cannot recall: ${params.scope} memory is not enabled for this session.`,
            },
          ],
          details: { matches: [] },
        };
      }
      const searchScope = params.scope ?? (allowed.length === 1 ? allowed[0] : undefined);
      const matches = await store.searchMemory({
        query: params.query,
        scope: searchScope,
        cwd,
      });
      return { content: [{ type: "text", text: renderRecall(matches) }], details: { matches } };
    },
  });

  return options.readOnly ? [recall] : [remember, recall];
}

function renderRecall(matches: MemoryEntry[]): string {
  if (matches.length === 0) return "No matching memories.";
  const blocks = matches.map((entry, index) => {
    const body =
      entry.content.length > RECALL_CONTENT_CHARS
        ? `${entry.content.slice(0, RECALL_CONTENT_CHARS)}…`
        : entry.content;
    return `${index + 1}. [${entry.scope}] ${entry.name}\n${body.trim()}`;
  });
  return `Found ${matches.length} ${matches.length === 1 ? "memory" : "memories"}:\n\n${blocks.join("\n\n")}`;
}
