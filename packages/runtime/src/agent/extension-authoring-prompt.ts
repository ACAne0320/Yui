// A compact system-prompt note that makes "build me an extension" work in a
// chat session: it tells the model the capability exists, where to write so Yui
// actually loads the result, and which parts of Pi's extension API are inert in
// this non-terminal host. The full reference is docs/extension-authoring.md;
// the load-bearing rules are inlined here so the guidance survives packaging
// even when that file is not on disk next to the bundled runtime.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Resolved from source layout (packages/runtime/src/agent → repo root). Present
// in a from-source run; absent in some bundles, in which case the "read the
// full reference" line is dropped rather than pointing at a missing file.
const DOC_PATH = fileURLToPath(new URL("../../../../docs/extension-authoring.md", import.meta.url));

/**
 * Build the extension-authoring note for a session, with the real global
 * extensions directory derived from `agentDir`.
 */
export function buildExtensionAuthoringNote(agentDir: string): string {
  const globalDir = join(agentDir, "extensions");
  const lines = [
    "## Building Yui extensions",
    "",
    "When the user asks for a custom tool or automation, you can author a Pi extension for them. Yui is a constrained, non-terminal host, so follow these rules:",
    `- Write to ${globalDir}/<name>.ts (global, all sessions) or <cwd>/.pi/extensions/<name>.ts (project-local). A new chat session must be opened before a newly written extension loads — there is no live reload.`,
    '- Deliver behavior as registerTool(...) or on("tool_call" | "tool_result" | "context", ...) handlers. For user interaction use only ctx.ui.{select, confirm, input, editor, notify, setStatus, setWidget(key, string[], { placement }), setTitle, setWorkingMessage, setEditorText}; always handle the dismissed default (e.g. confirm → false).',
    '- setWidget content must be a string[]; its placement must be exactly "aboveEditor" or "belowEditor" (any other value renders nothing).',
    "- Do NOT use ctx.ui.custom(), TUI chrome (setFooter/setHeader/setEditorComponent/onTerminalInput), tool renderCall/renderResult, registerCommand handler bodies, registerShortcut, or registerMessageRenderer: they load but silently do nothing in Yui.",
    '- To call an external API for a provider the user configured in Yui (e.g. DeepSeek, OpenAI), read the key with `await ctx.modelRegistry.getApiKeyForProvider("<providerId>")` rather than process.env — Yui stores credentials in auth storage, not env vars.',
    "- Keep session_start and other lifecycle handlers non-blocking: never await slow work (network, long timers) inside them (pi awaits handlers in series). Kick it off fire-and-forget and update the UI when it resolves.",
    '- Import runtime types from "@earendil-works/pi-coding-agent" (v0.78.0) and tool schemas from "typebox". Do not invent APIs or copy from any pi/ source tree.',
    "- Extensions run as trusted local code with no sandbox; show the user the source before they enable it.",
  ];
  if (existsSync(DOC_PATH)) {
    lines.push(`- Read ${DOC_PATH} for the full capability matrix before authoring.`);
  }
  return lines.join("\n");
}
