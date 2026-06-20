// Built-in `subagent` tool: delegates self-contained tasks to child
// AgentSessions running in-process with isolated context windows. This is
// yui's native replacement for pi's spawn-a-`pi`-binary subagent extension,
// which cannot locate the host binary inside Electron.
//
// Modes: single (`task`, optional `agent`), parallel (`tasks` array, max 8,
// concurrency-capped) or chain (`chain` array, sequential with `{previous}`
// report substitution). Named agents are the builtin roles plus
// `<agentDir>/agents/*.md` overrides (see subagent-agents.ts); per-task
// progress folds into structured transcripts (see subagent-transcript.ts).
//
// Each child gets FRESH cwd-bound services instead of reusing the parent's:
// AgentSession's constructor copies its action handlers into the (per-services)
// shared extension runtime object, so two live sessions on one services object
// would hijack each other's extension API routing. authStorage/modelRegistry
// are profile-global and stay shared.
//
// The children's extensions bind to the PARENT's UI bridge: gating extensions
// (e.g. permission-gate) keep working inside subagents and their dialogs
// surface in the parent conversation instead of auto-resolving to denials.

import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import {
  type AgentSession,
  type AuthStorage,
  createAgentSessionFromServices,
  createAgentSessionServices,
  defineTool,
  type ExtensionError,
  type ExtensionUIContext,
  type ModelRegistry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { createMemoryTools } from "../persona/memory-tools.ts";
import type { PersonaStore } from "../persona/persona-store.ts";
import { resolvePersonaScope } from "../persona/persona-scope.ts";
import { buildPersonaSystemPrompt } from "../persona/system-prompt.ts";
import { loadAgents, resolveAgentModel, type SubagentAgentConfig } from "./subagent-agents.ts";
import { SubagentTranscript, type TranscriptItem } from "./subagent-transcript.ts";

/** Per-task transcript tail shown while multiple tasks run in parallel. */
const PER_TASK_PROGRESS_CHARS = 600;
/** Cap on the final report returned to the parent model. */
const MAX_RESULT_CHARS = 50_000;
/** Minimum interval between streamed onUpdate emissions for text deltas. */
const PROGRESS_THROTTLE_MS = 100;
const MAX_PARALLEL_TASKS = 8;
const MAX_CONCURRENCY = 4;

type TaskStatus = "pending" | "running" | "done" | "failed" | "aborted";

export interface SubagentDetails {
  status: "running" | "done" | "aborted" | "invalid";
  toolUseCount: number;
  tasks: Array<{
    agent?: string;
    /** First line of the delegated task, for card titles. */
    task: string;
    status: TaskStatus;
    toolUseCount: number;
    /** Recent transcript steps (tail-capped) for structured rendering. */
    steps: TranscriptItem[];
  }>;
}

/**
 * Late-bound parent-session context. The tool definition must exist before the
 * parent AgentSession (customTools are constructor input), so the service
 * fills this in right after the session and its UI bridge are created; no
 * prompt can reach the tool before then.
 */
export interface SubagentHost {
  session?: AgentSession;
  bridge?: ExtensionUIContext;
  cwd?: string;
  onExtensionError?: (error: ExtensionError) => void;
}

export interface SubagentToolOptions {
  agentDir: string;
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
  persona: PersonaStore;
  host: SubagentHost;
}

function truncateResult(text: string): string {
  return text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}\n…(truncated)` : text;
}

function tailOf(text: string, max: number): string {
  return text.length > max ? `…${text.slice(-max)}` : text;
}

export function includeCustomToolNames(
  tools: string[] | undefined,
  customTools: Array<{ name: string }>,
): string[] | undefined {
  if (!tools) return undefined;
  if (customTools.length === 0) return tools;
  return [...new Set([...tools, ...customTools.map((tool) => tool.name)])];
}

/** Card title for a task: its first non-empty line, length-capped. */
function taskTitle(task: string): string {
  const line =
    task
      .split("\n")
      .find((part) => part.trim() !== "")
      ?.trim() ?? "";
  return line.length > 140 ? `${line.slice(0, 139)}…` : line;
}

/** Run jobs with at most `limit` in flight; results are not needed, only completion. */
async function runWithConcurrency(limit: number, jobs: Array<() => Promise<void>>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, jobs.length) }, async () => {
    while (next < jobs.length) {
      const index = next++;
      await jobs[index]();
    }
  });
  await Promise.all(workers);
}

interface TaskState {
  agent: SubagentAgentConfig | undefined;
  task: string;
  status: TaskStatus;
  transcript: SubagentTranscript;
  failure?: string;
}

function taskLabel(state: TaskState, index: number): string {
  return state.agent ? `Task ${index + 1} (${state.agent.name})` : `Task ${index + 1}`;
}

function renderProgressAll(states: TaskState[]): string {
  if (states.length === 1) return states[0].transcript.renderProgress();
  const sections = states.map((state, index) => {
    const head = `[${taskLabel(state, index)}] ${state.status}`;
    const tail = tailOf(state.transcript.renderProgress(), PER_TASK_PROGRESS_CHARS);
    return tail ? `${head}\n${tail}` : head;
  });
  return tailOf(sections.join("\n\n"), PER_TASK_PROGRESS_CHARS * states.length);
}

function renderFinal(states: TaskState[]): string {
  if (states.length === 1) {
    const state = states[0];
    if (state.failure) return `Subagent failed: ${state.failure}`;
    if (state.status === "aborted") return "Subagent aborted.";
    return (
      state.transcript.finalText || "(subagent completed without producing a final text reply)"
    );
  }
  const sections = states.map((state, index) => {
    const header = `## ${taskLabel(state, index)}: ${tailOf(state.task, 100)}`;
    const body = state.failure
      ? `FAILED: ${state.failure}`
      : state.status === "aborted"
        ? "(aborted)"
        : state.transcript.finalText || "(no final text reply)";
    return `${header}\n\n${body}`;
  });
  return truncateResult(sections.join("\n\n"));
}

const taskItemSchema = Type.Object({
  agent: Type.Optional(
    Type.String({ description: "Named agent to run this task. Omit for the default subagent." }),
  ),
  task: Type.String({ description: "Task for this subagent." }),
});

const subagentParameters = Type.Object({
  agent: Type.Optional(
    Type.String({
      description: "Named agent for single mode. Omit for the default subagent.",
    }),
  ),
  task: Type.Optional(
    Type.String({
      description:
        "Single mode: the task to delegate. The subagent starts with a fresh context and " +
        "cannot see this conversation, so include every fact, path, and constraint it needs.",
    }),
  ),
  tasks: Type.Optional(
    Type.Array(taskItemSchema, {
      description: `Parallel mode: up to ${MAX_PARALLEL_TASKS} independent tasks run concurrently.`,
    }),
  ),
  chain: Type.Optional(
    Type.Array(taskItemSchema, {
      description:
        `Chain mode: up to ${MAX_PARALLEL_TASKS} tasks run sequentially; ` +
        "`{previous}` in a task is replaced with the previous step's report. " +
        "The chain stops at the first failure.",
    }),
  ),
});

/**
 * Substitute the previous step's report into a chain task. The replacement is
 * a function so `$`-patterns in the report (`$&`, `` $` ``…) stay literal —
 * string replacements would interpret them.
 */
export function resolveChainTask(task: string, previousReport: string): string {
  return task.replaceAll("{previous}", () => previousReport);
}

export function createSubagentTool(options: SubagentToolOptions) {
  // Loaded once per parent session so the model knows which named agents
  // exist (builtins + user files); execute() re-reads for authoritative
  // resolution. Never empty: the builtin roles are always available.
  const agentsAtCreation = loadAgents(options.agentDir);
  const agentHint = ` Named agents: ${agentsAtCreation
    .map((a) => `${a.name} — ${a.description}`)
    .join("; ")}.`;

  const invalid = (text: string): AgentToolResult<SubagentDetails> => ({
    content: [{ type: "text", text }],
    details: { status: "invalid", toolUseCount: 0, tasks: [] },
  });

  return defineTool<typeof subagentParameters, SubagentDetails>({
    name: "subagent",
    label: "Subagent",
    description:
      "Delegate self-contained tasks to subagents running in isolated contexts with their " +
      "own tools. They share the working directory but not this conversation; each returns " +
      "its final report. Single mode: {task, agent?}. Parallel mode: {tasks: [{task, agent?}]}. " +
      "Chain mode: {chain: [{task, agent?}]} runs sequentially with {previous} substitution." +
      agentHint,
    promptSnippet:
      "subagent: delegate self-contained tasks to isolated subagents (single, parallel, or chain) and get their final reports",
    parameters: subagentParameters,

    async execute(_toolCallId, params, signal, onUpdate) {
      const { session: parent, bridge, cwd } = options.host;
      if (!parent || !bridge || !cwd) {
        throw new Error("subagent tool is not bound to a host session yet");
      }

      const agents = loadAgents(options.agentDir);
      const describeAgents = () => agents.map((a) => a.name).join(", ");

      const hasSingle = typeof params.task === "string" && params.task.trim() !== "";
      const hasBatch = Array.isArray(params.tasks) && params.tasks.length > 0;
      const hasChain = Array.isArray(params.chain) && params.chain.length > 0;
      if (Number(hasSingle) + Number(hasBatch) + Number(hasChain) !== 1) {
        return invalid(
          "Invalid parameters: provide exactly one mode — `task` (single), a non-empty " +
            "`tasks` array (parallel), or a non-empty `chain` array (sequential). " +
            `Available agents: ${describeAgents()}.`,
        );
      }
      const specs = hasSingle
        ? [{ agent: params.agent, task: (params.task as string).trim() }]
        : ((params.tasks ?? params.chain) as Array<{ agent?: string; task: string }>);
      if (specs.length > MAX_PARALLEL_TASKS) {
        return invalid(`Too many tasks: ${specs.length} (max ${MAX_PARALLEL_TASKS}).`);
      }
      if (specs.some((spec) => typeof spec.task !== "string" || spec.task.trim() === "")) {
        return invalid("Invalid parameters: every entry needs a non-empty `task` string.");
      }
      const unknown = [
        ...new Set(
          specs
            .map((spec) => spec.agent)
            .filter((name): name is string => Boolean(name))
            .filter((name) => !agents.some((agent) => agent.name === name)),
        ),
      ];
      if (unknown.length > 0) {
        return invalid(
          `Unknown agent(s): ${unknown.join(", ")}. Available agents: ${describeAgents()}.`,
        );
      }

      const personaConfig = await options.persona.getConfig();
      const personaScope = resolvePersonaScope({ config: personaConfig, kind: "subagent" });
      const personaPrompt = await buildPersonaSystemPrompt(options.persona, personaScope, cwd, {
        memoryReadOnly: true,
      });
      const memoryTools = createMemoryTools({
        store: options.persona,
        cwd,
        scope: personaScope,
        readOnly: true,
      });

      const states: TaskState[] = specs.map((spec) => ({
        agent: spec.agent ? agents.find((agent) => agent.name === spec.agent) : undefined,
        task: spec.task,
        status: "pending",
        transcript: new SubagentTranscript(),
      }));
      const detailsOf = (status: SubagentDetails["status"]): SubagentDetails => {
        const final = status !== "running";
        return {
          status,
          toolUseCount: states.reduce((sum, state) => sum + state.transcript.toolUseCount, 0),
          tasks: states.map((state) => ({
            agent: state.agent?.name,
            task: taskTitle(state.task),
            status: state.status,
            toolUseCount: state.transcript.toolUseCount,
            steps: state.transcript.steps(final),
          })),
        };
      };

      let lastEmit = 0;
      const emitProgress = (force: boolean) => {
        if (!onUpdate) return;
        const now = Date.now();
        if (!force && now - lastEmit < PROGRESS_THROTTLE_MS) return;
        lastEmit = now;
        onUpdate({
          content: [{ type: "text", text: renderProgressAll(states) }],
          details: detailsOf("running"),
        });
      };

      const runTask = async (state: TaskState): Promise<void> => {
        if (signal?.aborted) {
          state.status = "aborted";
          return;
        }
        state.status = "running";
        emitProgress(true);
        try {
          const model = state.agent?.model
            ? resolveAgentModel(options.modelRegistry, state.agent.model)
            : parent.model;
          // Fail fast rather than silently substituting another model: the
          // agent's behavior was tuned for its pinned model, and the failure
          // shows up on the task card with an actionable message.
          if (state.agent?.model && !model) {
            throw new Error(
              `Model "${state.agent.model}" for agent "${state.agent.name}" is not in the ` +
                "model registry. Fix the agent's model in settings, or check provider auth.",
            );
          }
          // Fresh per-task services (see module comment). Reloads extensions
          // through jiti each call; cache per parent session if this gets hot.
          const appendSystemPrompt = [
            ...(state.agent?.systemPrompt.trim() ? [state.agent.systemPrompt] : []),
            ...(personaPrompt ? [personaPrompt] : []),
          ];
          const tools = includeCustomToolNames(state.agent?.tools, memoryTools);
          const services = await createAgentSessionServices({
            cwd,
            agentDir: options.agentDir,
            authStorage: options.authStorage,
            modelRegistry: options.modelRegistry,
            resourceLoaderOptions:
              appendSystemPrompt.length > 0 ? { appendSystemPrompt } : undefined,
          });
          const { session: child } = await createAgentSessionFromServices({
            services,
            sessionManager: SessionManager.inMemory(cwd),
            model: model ?? parent.model,
            thinkingLevel: parent.thinkingLevel,
            tools,
            // Only read-only memory tools: subagents must not recursively spawn subagents.
            customTools: memoryTools,
          });
          const unsubscribe = child.subscribe((event) => {
            if (state.transcript.apply(event)) emitProgress(event.type !== "message_update");
          });
          const onAbort = () => {
            void child.abort();
          };
          signal?.addEventListener("abort", onAbort);
          // Close the race where the signal fired between the entry check and
          // the listener registration: the child would otherwise never abort.
          if (signal?.aborted) onAbort();
          try {
            await child.bindExtensions({
              uiContext: bridge,
              onError: options.host.onExtensionError,
            });
            await child.prompt(state.task);
          } finally {
            signal?.removeEventListener("abort", onAbort);
            unsubscribe();
            child.dispose();
          }
          state.status = signal?.aborted ? "aborted" : "done";
        } catch (error) {
          state.status = "failed";
          state.failure = error instanceof Error ? error.message : String(error);
        }
        emitProgress(true);
      };

      if (hasChain) {
        // Sequential: each step sees the previous report via {previous}; the
        // chain stops at the first failure and the rest stay aborted.
        let previousReport = "";
        for (const state of states) {
          state.task = resolveChainTask(state.task, previousReport);
          await runTask(state);
          if (state.status !== "done") {
            for (const rest of states) {
              if (rest.status === "pending") rest.status = "aborted";
            }
            emitProgress(true);
            break;
          }
          previousReport = state.transcript.finalText;
        }
      } else {
        await runWithConcurrency(
          MAX_CONCURRENCY,
          states.map((state) => () => runTask(state)),
        );
      }

      const failures = states.filter((state) => state.status === "failed");
      if (failures.length === states.length && !signal?.aborted) {
        throw new Error(failures.map((state) => state.failure).join("; "));
      }
      return {
        content: [{ type: "text", text: renderFinal(states) }],
        details: detailsOf(signal?.aborted ? "aborted" : "done"),
      };
    },
  });
}
