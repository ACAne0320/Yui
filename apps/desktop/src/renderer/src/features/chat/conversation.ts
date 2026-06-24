import type { AppDefaults, AppModel, AppSessionSummary, ThinkingLevel } from "@yui/contracts";
import { queryKeys } from "@renderer/data/keys";
import i18n from "@renderer/i18n";
import { api } from "@renderer/lib/api";
import { formatError } from "@renderer/lib/format";
import { modelKey } from "@renderer/lib/model";
import { queryClient } from "@renderer/lib/query-client";
import { useUiStore } from "@renderer/stores/ui-store";
import { clearAttachments } from "./attachments";
import {
  seedConversation,
  updateActiveExtensionCommands,
  updateActiveExtensionUi,
  updateConversationTitle,
  useChatStore,
} from "./store";

// Conversation orchestration lives here as plain functions rather than a hook:
// it only ever needs a *snapshot* of server state at call time, not reactive
// subscriptions. Reading that snapshot straight from the react-query cache keeps
// the logic out of React's render cycle (and avoids stale closures), so call
// sites can invoke these directly without plumbing `models`/`defaults`/`baseCwd`.
function readContext() {
  const models = queryClient.getQueryData<AppModel[]>(queryKeys.models) ?? [];
  const defaults = queryClient.getQueryData<AppDefaults>(queryKeys.defaults) ?? {};
  return { models, defaults };
}

// Seed extension UI state for a freshly subscribed session. The snapshot is
// the baseline; events arriving afterwards apply idempotently on top (statuses
// and widgets overwrite by key, pending dialogs dedupe by requestId). Failures
// are non-fatal: the chat works without extension slots.
async function loadExtensionUi(sessionId: string) {
  try {
    const snapshot = await api.agents.getExtensionUiState({ sessionId });
    if (useChatStore.getState().active?.sessionId !== sessionId) return;
    updateActiveExtensionUi(snapshot);
    const info = await api.agents.getExtensions({ sessionId });
    // Flatten each extension's commands into the session's slash-menu list.
    updateActiveExtensionCommands(
      info.extensions.flatMap((extension) =>
        extension.commands.map((command) => ({
          name: command.name,
          description: command.description,
          extensionPath: extension.path,
        })),
      ),
    );
    if (info.errors.length > 0) {
      useUiStore.getState().setNotice(
        i18n.t("chat.extensions.loadErrors", {
          count: info.errors.length,
          path: info.errors[0].path,
        }),
      );
    }
  } catch {
    // Extension UI is best-effort; never block the conversation on it.
  }
}

async function detachActiveSession() {
  useChatStore.getState().detachActiveConversation();
}

async function startNewConversation() {
  const { models, defaults } = readContext();
  await detachActiveSession();
  const preferred =
    models.find(
      (model) => model.providerId === defaults.providerId && model.modelId === defaults.modelId,
    ) ?? models[0];
  // Leave the cwd unset: a fresh scratch workspace is created on first send
  // unless the user picks a directory in the meantime.
  useChatStore.getState().resetConversation({
    selectedCwd: "",
    selectedModelKey: preferred ? modelKey(preferred) : "",
    selectedThinking: defaults.thinkingLevel ?? "medium",
  });
  useUiStore.setState({ settingsOpen: false, railPeek: false });
}

async function openConversation(summary: AppSessionSummary) {
  const state = useChatStore.getState();
  if (state.loadingConversation || state.active?.sessionPath === summary.sessionPath) return;
  state.setLoadingConversation(true);
  useUiStore.setState({ settingsOpen: false, railPeek: false, notice: null });
  try {
    // Keep the outgoing thread on screen (cached, not cleared) while the target
    // session opens; seedConversation/restoreCachedConversation swaps it in
    // atomically below. Detaching here instead would flash the empty new-chat
    // view for the duration of the async load.
    useChatStore.getState().cacheActiveConversation();
    const info = await queryClient.fetchQuery({
      queryKey: queryKeys.sessionInfo(summary.sessionPath),
      queryFn: () => api.sessions.getInfo({ sessionPath: summary.sessionPath }),
    });
    const opened = await api.agents.openSession({
      cwd: info.cwd,
      sessionPath: info.sessionPath,
    });
    await api.agents.subscribe({ sessionId: opened.sessionId });
    const active = {
      sessionId: opened.sessionId,
      sessionPath: info.sessionPath,
      title: info.title,
      cwd: opened.cwd,
      model: opened.model ?? info.model,
      thinkingLevel: opened.thinkingLevel,
    };
    const busy = await api.agents.isBusy({ sessionId: opened.sessionId });
    if (!useChatStore.getState().restoreCachedConversation({ active, busy })) {
      // Read history only after subscribing, so messages persisted while we were
      // attaching are included; future message_update events carry full partial
      // messages and continue from this baseline.
      const history = await queryClient.fetchQuery({
        queryKey: queryKeys.sessionHistory(summary.sessionPath),
        queryFn: () => api.sessions.getHistory({ sessionPath: summary.sessionPath }),
        staleTime: Number.POSITIVE_INFINITY,
      });
      seedConversation({
        active,
        messages: history,
        busy,
      });
    }
    useChatStore.setState({
      selectedCwd: opened.cwd,
      selectedThinking: opened.thinkingLevel,
      selectedModelKey: opened.model ? modelKey(opened.model) : state.selectedModelKey,
    });
    await loadExtensionUi(opened.sessionId);
  } catch (error) {
    useUiStore.getState().setNotice(formatError(error));
  } finally {
    useChatStore.getState().setLoadingConversation(false);
  }
}

async function deleteConversation(summary: AppSessionSummary) {
  // A live session holds its file open and could re-persist on close, so when
  // removing the conversation that's currently open we tear it down (and reset
  // to a fresh chat) before deleting the file from disk.
  const isActive = useChatStore.getState().active?.sessionPath === summary.sessionPath;
  const liveSessionId = useChatStore.getState().getCachedSessionIdByPath(summary.sessionPath);
  try {
    if (liveSessionId) {
      await api.agents.closeSession({ sessionId: liveSessionId }).catch(() => undefined);
      useChatStore.getState().forgetConversation(liveSessionId);
    }
    if (isActive) await startNewConversation();
    await api.sessions.delete({ sessionPath: summary.sessionPath });
    await queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
  } catch (error) {
    useUiStore.getState().setNotice(formatError(error));
  }
}

async function renameConversation(summary: AppSessionSummary, title: string) {
  const trimmed = title.trim();
  // No-op on an empty name or one that matches what's already shown.
  if (!trimmed || trimmed === summary.title) return;
  try {
    await api.sessions.rename({ sessionPath: summary.sessionPath, title: trimmed });
    // Reflect the new name on the open thread's header right away; the sidebar
    // picks it up from the re-fetched list.
    const active = useChatStore.getState().active;
    if (active?.sessionId && active.sessionPath === summary.sessionPath) {
      updateConversationTitle(active.sessionId, trimmed);
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
  } catch (error) {
    useUiStore.getState().setNotice(formatError(error));
  }
}

// Fetch a model-generated title for a freshly started session and animate it
// into the header. Best-effort: on any failure we silently keep the placeholder
// (truncated first message). The sidebar refreshes itself via the
// session_info_changed event the runtime emits when it persists the name.
async function titleizeSession(sessionId: string, firstMessage: string) {
  try {
    const title = await api.agents.generateTitle({ sessionId, firstMessage });
    if (title) updateConversationTitle(sessionId, title);
  } catch (error) {
    console.error("Title generation failed:", error);
    if (useChatStore.getState().active?.sessionId === sessionId) {
      useChatStore.setState({ titlePending: false });
    }
  }
}

// Set while a new session is being spun up (scratch dir → open → subscribe).
// During that window the input still holds its text, so a second Enter would
// otherwise race in and create a duplicate session.
let creatingSession = false;

async function send(override?: string) {
  const { models } = readContext();
  const state = useChatStore.getState();
  const text = (override ?? state.input).trim();
  // Image-only turns are not allowed: a Pi user message always carries a
  // (possibly empty) text block, and providers like OpenAI/Anthropic reject an
  // empty text block outright ("the request is invalid"). Require real text.
  if (!text) return;
  // A known "/command" executes instead of being sent as a message — runs the
  // command and clears the draft, with no phantom user bubble.
  if (text.startsWith("/") && (await maybeRunSlashCommand(text))) {
    if (override === undefined) useChatStore.setState({ input: "" });
    return;
  }
  const isNewSession = !state.active?.sessionId;
  if (isNewSession && creatingSession) return;
  const images = state.attachments.map((attachment) => ({
    type: "image" as const,
    data: attachment.base64,
    mimeType: attachment.mimeType,
  }));
  const selectedModel = models.find((model) => modelKey(model) === state.selectedModelKey);
  if (!selectedModel) {
    useUiStore.setState({
      notice: i18n.t("chat.notices.authorizeModel"),
      settingsOpen: true,
      settingsSection: "providers",
    });
    return;
  }

  useUiStore.getState().setNotice(null);
  let sessionId = state.active?.sessionId;
  let localId: string | undefined;
  if (isNewSession) creatingSession = true;
  try {
    if (!sessionId) {
      // No directory chosen → spin up a throwaway scratch workspace for this
      // new conversation. An existing session keeps its own creation-time cwd.
      let cwd = state.selectedCwd.trim();
      if (!cwd) {
        cwd = await api.desktop.createScratchDirectory();
        useChatStore.setState({ selectedCwd: cwd });
      }
      const opened = await api.agents.openSession({
        cwd,
        providerId: selectedModel.providerId,
        modelId: selectedModel.modelId,
        thinkingLevel: state.selectedThinking,
        persona: state.noMemory ? { memory: false } : undefined,
      });
      sessionId = opened.sessionId;
      await api.agents.subscribe({ sessionId });
      // Placeholder title (truncated first message) shown immediately and kept
      // as the fallback; a model-generated title animates in once ready.
      const title = text.length > 26 ? `${text.slice(0, 26)}…` : text;
      useChatStore.setState({
        active: {
          sessionId,
          sessionPath: opened.sessionPath,
          title,
          cwd: opened.cwd,
          model: opened.model,
          thinkingLevel: opened.thinkingLevel,
        },
        titlePending: true,
        selectedCwd: opened.cwd,
        selectedThinking: opened.thinkingLevel,
      });
      void loadExtensionUi(sessionId);
    }

    localId = `local_user_${Date.now()}`;
    const pendingId = localId;
    useChatStore.setState((current) => ({
      messages: [
        ...current.messages,
        {
          id: pendingId,
          role: "user",
          // Text only: the sent image surfaces a moment later when the runtime
          // echoes the persisted user message (rendered out-of-band). The draft
          // thumbnails clear here to mirror the input emptying.
          content: [{ type: "text", text }],
          timestamp: Date.now(),
        },
      ],
      pendingUserId: pendingId,
      input: "",
    }));
    clearAttachments();

    if (useChatStore.getState().busy) {
      await api.agents.followUp({ sessionId, text, images });
    } else {
      useChatStore.setState({ busy: true });
      // Dispatch the turn but don't await it for titling: prompt() resolves only
      // when the whole run ends, while the title only needs the first user
      // message (already persisted by the time the turn starts).
      const run = api.agents.prompt({ sessionId, text, images });
      if (isNewSession) void titleizeSession(sessionId, text);
      await run;
      // An extension may consume the input via the `input` hook without starting
      // a turn (no agent_start/agent_end to drive busy), so reconcile with the
      // runtime to clear the optimistic thinking indicator when no turn ran.
      useChatStore.setState({
        busy: await api.agents.isBusy({ sessionId }).catch(() => false),
      });
    }
  } catch (error) {
    // Roll back the optimistic user message (a no-op when events already
    // replaced it with the real message) and restore the draft so the user can
    // retry, unless they typed a new one meanwhile.
    const failedId = localId;
    useChatStore.setState((current) => ({
      messages: failedId
        ? current.messages.filter((message) => message.id !== failedId)
        : current.messages,
      pendingUserId: current.pendingUserId === failedId ? null : current.pendingUserId,
      input: current.input === "" ? text : current.input,
    }));
    // Re-read busy from the runtime instead of assuming idle: a `session_busy`
    // rejection means another turn is still streaming.
    const busy = sessionId ? await api.agents.isBusy({ sessionId }).catch(() => false) : false;
    useChatStore.setState({ busy });
    useUiStore.getState().setNotice(formatError(error));
  } finally {
    if (isNewSession) creatingSession = false;
  }
}

async function abort() {
  const sessionId = useChatStore.getState().active?.sessionId;
  if (!sessionId) return;
  try {
    await api.agents.abort({ sessionId });
  } catch (error) {
    useUiStore.getState().setNotice(formatError(error));
  }
}

// Reload the active session's runtime resources (extensions, skills, prompts,
// settings) without opening a new session. Mirrors Pi's `/reload`, so a newly
// added extension is picked up in place. Rejects with `session_busy` mid-turn.
async function reloadSession() {
  const sessionId = useChatStore.getState().active?.sessionId;
  if (!sessionId) return;
  try {
    await api.agents.reloadSession({ sessionId });
    useUiStore.getState().setNotice(i18n.t("chat.notices.reloaded"));
    // The reload re-discovers extensions; refresh the renderer's snapshot and
    // list. loadExtensionUi overrides the notice above if loads now error.
    await loadExtensionUi(sessionId);
  } catch (error) {
    useUiStore.getState().setNotice(formatError(error));
  }
}

// Execute an extension slash command (e.g. "/greet args") on the active session.
// Routed through prompt(), which detects a registered command and runs its
// handler instead of sending a model turn — so no user message is added and no
// model is required. UI/tool/exec actions run; Pi session-control actions are
// currently no-ops.
async function runSlashCommand(text: string) {
  const sessionId = useChatStore.getState().active?.sessionId;
  if (!sessionId) return;
  try {
    await api.agents.prompt({ sessionId, text });
    // A command usually starts no turn; reconcile busy with the runtime (a
    // command that does start one flips it back via events).
    useChatStore.setState({ busy: await api.agents.isBusy({ sessionId }).catch(() => false) });
  } catch (error) {
    useUiStore.getState().setNotice(formatError(error));
  }
}

// If the composer holds a bare "/command" (optionally with args) that matches a
// known command, run it instead of sending a message (no phantom user bubble).
// Returns whether it handled the input; unknown "/..." text is left for the
// normal send path (Pi may still expand it as a skill/template).
async function maybeRunSlashCommand(text: string): Promise<boolean> {
  const token = text.slice(1).trim().split(/\s+/)[0];
  if (!token) return false;
  // Extension commands run with their full "/cmd args" text (args preserved).
  if (useChatStore.getState().extensionCommands.some((command) => command.name === token)) {
    await runSlashCommand(text);
    return true;
  }
  // Built-in app commands (zero-arg). Keep in sync with buildSlashCommands.
  if (token === "new") {
    void startNewConversation();
    return true;
  }
  if (token === "reload") {
    void reloadSession();
    return true;
  }
  return false;
}

async function browseCwd() {
  // The cwd is fixed once a session exists; only the draft (new conversation)
  // cwd is editable, matching the manual-input field in the composer.
  if (useChatStore.getState().active?.sessionId) return;
  const current = useChatStore.getState().selectedCwd;
  const picked = await api.desktop.selectDirectory({ defaultPath: current || undefined });
  if (picked) useChatStore.setState({ selectedCwd: picked });
}

async function openDirectory(path: string) {
  if (!path) return;
  const error = await api.desktop.openPath({ path }).catch(formatError);
  if (error) useUiStore.getState().setNotice(error);
}

async function chooseModel(key: string) {
  const { models } = readContext();
  const state = useChatStore.getState();
  const model = models.find((item) => modelKey(item) === key);
  useChatStore.setState({
    selectedModelKey: key,
    selectedThinking:
      model && !model.availableThinkingLevels.includes(state.selectedThinking)
        ? (model.availableThinkingLevels[0] ?? "off")
        : state.selectedThinking,
  });

  // Apply to the live session when one exists; otherwise this only adjusts the
  // draft used to open the next session. Pi clamps the thinking level to the
  // new model and emits thinking_level_changed, keeping active.thinkingLevel in
  // sync on its own.
  const sessionId = state.active?.sessionId;
  if (!sessionId || !model) return;
  try {
    await api.agents.setModel({ sessionId, providerId: model.providerId, modelId: model.modelId });
    useChatStore.setState((current) => ({
      active: current.active
        ? { ...current.active, model: { providerId: model.providerId, modelId: model.modelId } }
        : null,
    }));
  } catch (error) {
    useUiStore.getState().setNotice(formatError(error));
  }
}

async function chooseThinking(level: ThinkingLevel) {
  useChatStore.setState({ selectedThinking: level });
  const sessionId = useChatStore.getState().active?.sessionId;
  if (!sessionId) return;
  try {
    await api.agents.setThinkingLevel({ sessionId, thinkingLevel: level });
  } catch (error) {
    useUiStore.getState().setNotice(formatError(error));
  }
}

export const conversation = {
  abort,
  browseCwd,
  chooseModel,
  chooseThinking,
  deleteConversation,
  renameConversation,
  openDirectory,
  openConversation,
  detachActiveSession,
  reloadSession,
  runSlashCommand,
  send,
  startNewConversation,
};
