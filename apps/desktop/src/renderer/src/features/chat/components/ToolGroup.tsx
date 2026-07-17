import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@renderer/ui/Icon";
import type { ToolSegment } from "../lib";
import { argSummary, ToolCard } from "./ToolCard";

/** Tool names that read as "ran a command" rather than "used a tool". */
const COMMAND_TOOLS = new Set(["bash"]);

/**
 * A folded run of consecutive tool calls: one quiet row summarizing the batch
 * ("Ran 5 commands ⌄"), expandable to the per-tool rows, each of which keeps its
 * own toggle to the full output. Stays collapsed by default — the manual toggle
 * sticks because nothing syncs the state back from props. Errors and the running
 * spinner surface on the folded row so nothing important hides behind it.
 */
export function ToolGroup({ tools }: { tools: ToolSegment[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const running = tools.some((tool) => tool.running);
  const failed = tools.some((tool) => tool.error);
  const allCommands = tools.every((tool) => COMMAND_TOOLS.has(tool.name));
  const label = allCommands
    ? t("chat.tools.groupCommands", { count: tools.length })
    : t("chat.tools.groupTools", { count: tools.length });
  // Inline "still alive" signal: what is executing right now, without unfolding.
  const active = tools.findLast((tool) => tool.running);
  const activeSummary = active ? `${active.name} ${argSummary(active.args)}`.trim() : "";

  return (
    <div className="tool-group" data-open={open} data-running={running} data-error={failed}>
      <button onClick={() => setOpen((value) => !value)}>
        <span className="tool-status">
          {running ? (
            <span className="spinner" />
          ) : (
            <Icon name={failed ? "info" : "checkCircle"} size={15} />
          )}
        </span>
        <span className="tool-group-summary">{label}</span>
        <Icon name="chevron" size={13} />
        {activeSummary !== "" && <code>{activeSummary}</code>}
      </button>
      {open && (
        <div className="tool-group-items">
          {tools.map((tool) => (
            <ToolCard
              key={tool.id}
              name={tool.name}
              args={tool.args}
              detail={tool.detail}
              running={tool.running}
              error={tool.error}
            />
          ))}
        </div>
      )}
    </div>
  );
}
