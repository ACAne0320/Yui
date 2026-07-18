import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { type ExtensionUiRequest, thinkingLevelSchema } from "@yui/contracts";
import { createRuntime, resolveRuntimeConfig } from "@yui/runtime";
import { renderEvent, renderHistory } from "../output/render.ts";
import { reportError } from "../runtime.ts";
import { resolveSessionRef } from "./session.ts";

const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

export interface ChatOptions {
  cwd?: string;
  provider?: string;
  model?: string;
  thinking?: string;
  /** Resume a persisted session by id (full or prefix) or file path. */
  resume?: string;
  json?: boolean;
}

export async function runChat(opts: ChatOptions): Promise<number> {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const json = Boolean(opts.json);

  let thinkingLevel: ReturnType<typeof thinkingLevelSchema.parse> | undefined;
  if (opts.thinking !== undefined) {
    const parsed = thinkingLevelSchema.safeParse(opts.thinking);
    if (!parsed.success) {
      process.stderr.write(`error: invalid --thinking '${opts.thinking}'\n`);
      return 1;
    }
    thinkingLevel = parsed.data;
  }

  const runtime = await createRuntime(resolveRuntimeConfig({ cwd }));
  let exitCode = 0;

  try {
    const sessionPath = opts.resume ? await resolveSessionRef(runtime, opts.resume) : undefined;

    const opened = await runtime.agents.openSession({
      cwd,
      sessionPath,
      providerId: opts.provider,
      modelId: opts.model,
      thinkingLevel,
    });
    const { sessionId } = opened;

    // Make the active profile and session location visible: this is exactly the
    // path that the user (and a future desktop app on the same YUI_HOME) reads
    // and writes, so a mismatched directory is obvious immediately.
    if (!json) {
      const tag = opts.resume ? " (resumed)" : " (new)";
      const model = opened.model
        ? `${opened.model.providerId}/${opened.model.modelId}`
        : "(none — configure a provider with `yui auth set`)";
      process.stdout.write(`${DIM}profile: ${runtime.config.homeDir}${RESET}\n`);
      process.stdout.write(`${DIM}session: ${opened.sessionPath ?? "(in-memory)"}${tag}${RESET}\n`);
      process.stdout.write(`${DIM}cwd:     ${opened.cwd}${RESET}\n`);
      process.stdout.write(`${DIM}model:   ${model}  thinking: ${opened.thinkingLevel}${RESET}\n`);
    }

    // Replay prior turns so a resumed conversation has visible context.
    if (opts.resume && opened.sessionPath && !json) {
      const history = await runtime.sessions.getHistory({ sessionPath: opened.sessionPath });
      renderHistory(history, (chunk) => process.stdout.write(chunk));
    }

    // Extensions are fully bound, so they can raise dialogs (confirm/select/
    // input/editor) that wait for an answer. The CLI has no UI for them yet;
    // auto-cancel each one so an unanswered dialog can never hang the chat,
    // and tell the user where the interaction is supported.
    const cancelExtensionRequest = (request: ExtensionUiRequest) => {
      if (!json) {
        process.stdout.write(
          `${DIM}extension dialog "${request.title}" cancelled (interactive extension UI requires the desktop app)${RESET}\n`,
        );
      }
      void runtime.agents
        .respondToExtensionUi({
          sessionId,
          requestId: request.requestId,
          response: { kind: "cancelled" },
        })
        .catch(reportError);
    };

    const unsubscribe = runtime.agents.subscribe(sessionId, (event) => {
      if (json) process.stdout.write(`${JSON.stringify(event)}\n`);
      else renderEvent(event, (chunk) => process.stdout.write(chunk));
      if (event.type === "extension_ui_request") cancelExtensionRequest(event.request);
    });
    // Dialogs raised during session_start predate this subscription; cancel
    // those too so a gate opened while binding cannot hang either.
    for (const request of runtime.agents.getExtensionUiState(sessionId).pendingRequests) {
      cancelExtensionRequest(request);
    }

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: process.stdin.isTTY,
    });

    // Ctrl+C: abort the in-flight turn if streaming, otherwise end the session.
    rl.on("SIGINT", () => {
      if (runtime.agents.isBusy(sessionId)) void runtime.agents.abort(sessionId);
      else rl.close();
    });

    const showPrompt = () => {
      if (!json) process.stdout.write("\n› ");
    };

    showPrompt();
    for await (const line of rl) {
      const text = line.trim();
      if (text === "") {
        showPrompt();
        continue;
      }
      if (text === "/exit" || text === "/quit") break;
      // Manual context compaction (mirrors the desktop /compact action).
      // Compaction progress and outcome render through the event subscription.
      if (text === "/compact" || text.startsWith("/compact ")) {
        try {
          await runtime.agents.compact({
            sessionId,
            instructions: text.slice("/compact".length).trim() || undefined,
          });
        } catch (error) {
          reportError(error);
        }
        showPrompt();
        continue;
      }
      try {
        if (runtime.agents.isBusy(sessionId)) {
          // A streaming session rejects prompts; queue the input to run after
          // the current response instead (Ctrl+C still aborts the turn).
          await runtime.agents.followUp({ sessionId, text });
        } else {
          // Fire-and-forget: prompt() resolves only when the whole turn ends,
          // and awaiting it here would block the input loop until then.
          void runtime.agents.prompt({ sessionId, text }).catch(reportError);
        }
      } catch (error) {
        reportError(error);
      }
      showPrompt();
    }

    unsubscribe();
    rl.close();
  } catch (error) {
    exitCode = reportError(error);
  } finally {
    await runtime.dispose();
  }

  return exitCode;
}
