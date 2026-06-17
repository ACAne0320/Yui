import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "@renderer/ui/Icon";
import { Markdown } from "@renderer/ui/Markdown";

interface SubagentStep {
  kind: "tool" | "text";
  text: string;
  result?: string;
  isError?: boolean;
}
interface SubagentTask {
  agent?: string;
  task: string;
  status: "pending" | "running" | "done" | "failed" | "aborted";
  toolUseCount: number;
  steps: SubagentStep[];
}

const isStep = (value: unknown): value is SubagentStep => {
  const step = value as { kind?: unknown; text?: unknown };
  return (
    typeof value === "object" &&
    value !== null &&
    (step.kind === "tool" || step.kind === "text") &&
    typeof step.text === "string"
  );
};

/**
 * Extract the structured per-task state from `details.tasks` (live partial
 * results and persisted tool results alike). Defensive: history entries from
 * before the structured details existed carry text only and yield null.
 */
function parseSubagentTasks(detail: unknown): SubagentTask[] | null {
  const details = (detail as { details?: unknown })?.details;
  const tasks = (details as { tasks?: unknown })?.tasks;
  if (!Array.isArray(tasks) || tasks.length === 0) return null;
  const parsed: SubagentTask[] = [];
  for (const task of tasks) {
    const candidate = task as {
      agent?: unknown;
      task?: unknown;
      status?: unknown;
      toolUseCount?: unknown;
      steps?: unknown;
    };
    if (typeof candidate !== "object" || candidate === null) return null;
    if (typeof candidate.status !== "string") return null;
    parsed.push({
      agent: typeof candidate.agent === "string" ? candidate.agent : undefined,
      task: typeof candidate.task === "string" ? candidate.task : "",
      status: candidate.status as SubagentTask["status"],
      toolUseCount: typeof candidate.toolUseCount === "number" ? candidate.toolUseCount : 0,
      steps: Array.isArray(candidate.steps) ? candidate.steps.filter(isStep) : [],
    });
  }
  return parsed;
}

/**
 * Pending cards synthesized from the tool-call arguments, covering the gap
 * between the call starting and the first structured progress update.
 */
function tasksFromArgs(args: unknown): SubagentTask[] | null {
  const candidate = args as {
    task?: unknown;
    agent?: unknown;
    tasks?: unknown;
    chain?: unknown;
  };
  if (typeof candidate !== "object" || candidate === null) return null;
  const pending = (task: string, agent?: unknown): SubagentTask => ({
    agent: typeof agent === "string" ? agent : undefined,
    task,
    status: "pending",
    toolUseCount: 0,
    steps: [],
  });
  const batch = Array.isArray(candidate.tasks)
    ? candidate.tasks
    : Array.isArray(candidate.chain)
      ? candidate.chain
      : null;
  if (batch && batch.length > 0) {
    const tasks = batch
      .filter((item): item is { task: string; agent?: unknown } => {
        const entry = item as { task?: unknown };
        return typeof item === "object" && item !== null && typeof entry.task === "string";
      })
      .map((item) => pending(item.task, item.agent));
    return tasks.length > 0 ? tasks : null;
  }
  if (typeof candidate.task === "string") return [pending(candidate.task, candidate.agent)];
  return null;
}

/**
 * Resolve the task list to render for a subagent tool call, or null when the
 * generic tool line should be used instead. Args-synthesized pending cards
 * only bridge the gap until the first structured update; once the call has
 * finished, an unparseable result (e.g. invalid parameters) must fall through
 * rather than show forever-pending cards.
 */
export function subagentTasksFrom(
  detail: unknown,
  args: unknown,
  running: boolean,
): SubagentTask[] | null {
  return parseSubagentTasks(detail) ?? (running ? tasksFromArgs(args ?? detail) : null);
}

const statusIcon: Record<SubagentTask["status"], IconName> = {
  pending: "clock",
  running: "refresh",
  done: "check",
  failed: "info",
  aborted: "abort",
};

export function SubagentCards({ tasks }: { tasks: SubagentTask[] }) {
  return (
    <div className="subagent-group">
      {tasks.map((task, index) => (
        // Order is stable for the lifetime of the tool call.
        // eslint-disable-next-line react/no-array-index-key
        <SubagentTaskCard key={index} task={task} single={tasks.length === 1} />
      ))}
    </div>
  );
}

function ToolStep({ step }: { step: SubagentStep }) {
  const [open, setOpen] = useState(false);
  const space = step.text.indexOf(" ");
  const toolName = space > 0 ? step.text.slice(0, space) : step.text;
  const toolArgs = space > 0 ? step.text.slice(space + 1) : "";
  const expandable = Boolean(step.result);
  return (
    <div className="subagent-step-tool" data-error={Boolean(step.isError)} data-open={open}>
      <button onClick={() => expandable && setOpen((value) => !value)}>
        <Icon name={step.isError ? "info" : "checkCircle"} size={14} />
        <strong>{toolName}</strong>
        <span>{toolArgs}</span>
        {expandable && <Icon name="chevron" size={12} />}
      </button>
      {open && expandable && <pre>{step.result}</pre>}
    </div>
  );
}

function SubagentTaskCard({ task, single }: { task: SubagentTask; single: boolean }) {
  const { t } = useTranslation();
  // A lone task auto-opens while running so its progress streams in view;
  // parallel cards stay scannable and expand on demand. User toggles win.
  const [open, setOpen] = useState<boolean | null>(null);
  const expanded = open ?? (single && task.status === "running");
  const running = task.status === "running";
  return (
    <section className="subagent-task-card" data-status={task.status} data-open={expanded}>
      <button onClick={() => setOpen(!expanded)}>
        <Icon name="chat" size={14} />
        <span className="subagent-task-title">
          {task.task || task.agent || t("chat.tools.subagentDefault")}
        </span>
        {task.agent && <span className="subagent-pill agent">{task.agent}</span>}
        <span className="subagent-pill status" data-status={task.status}>
          {running ? (
            <span className="spinner" />
          ) : (
            <Icon name={statusIcon[task.status] ?? "info"} size={11} />
          )}
          {t(`chat.tools.status.${task.status}`)}
        </span>
        {task.toolUseCount > 0 && (
          <span className="subagent-pill">
            {t("chat.tools.toolUses", { count: task.toolUseCount })}
          </span>
        )}
        <Icon name="chevron" size={13} />
      </button>
      {expanded && task.steps.length > 0 && (
        <div className="subagent-steps">
          {task.steps.map((step, stepIndex) =>
            step.kind === "tool" ? (
              // eslint-disable-next-line react/no-array-index-key
              <ToolStep key={stepIndex} step={step} />
            ) : (
              // eslint-disable-next-line react/no-array-index-key
              <div className="subagent-step-text" key={stepIndex}>
                <Markdown>{step.text}</Markdown>
              </div>
            ),
          )}
        </div>
      )}
    </section>
  );
}
