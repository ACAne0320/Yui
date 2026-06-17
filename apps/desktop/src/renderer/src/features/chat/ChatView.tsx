import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useDefaults } from "@renderer/data/settings";
import { useModels } from "@renderer/data/models";
import { useProfile } from "@renderer/data/profile";
import { useSessions } from "@renderer/data/sessions";
import { yuiIconSrc } from "@renderer/lib/assets";
import { modelKey } from "@renderer/lib/model";
import { useUiStore } from "@renderer/stores/ui-store";
import { addFiles, removeAttachment } from "./attachments";
import { Composer } from "./components/Composer";
import { EmptyState } from "./components/EmptyState";
import { ExtensionRequestDialog } from "./components/ExtensionRequestDialog";
import { ExtensionStatusChips } from "./components/ExtensionStatusChips";
import { ExtensionWidgets } from "./components/ExtensionWidgets";
import { Thread } from "./components/Thread";
import { conversation } from "./conversation";
import { useAgentEvents } from "./hooks/useAgentEvents";
import { useChatStore } from "./store";

// Normalize Windows backslashes so scratch-path detection is separator-agnostic
// (the main process creates scratch dirs with the OS-native separator).
const toPosix = (path: string) => path.replace(/\\/g, "/");

export function ChatView() {
  const { t } = useTranslation();
  const profile = useProfile();
  const modelsQuery = useModels();
  const defaultsQuery = useDefaults();
  const sessionsQuery = useSessions();
  const models = modelsQuery.data ?? [];
  const defaults = defaultsQuery.data ?? {};
  const state = useChatStore();
  const openSettings = useUiStore((value) => value.openSettings);

  // Scratch workspaces live under `<homeDir>/scratch`; they are represented by
  // the single "使用临时目录" entry, never listed individually as pickable dirs.
  const homeDir = profile.data?.config.homeDir ?? "";
  const scratchPrefix = homeDir ? `${toPosix(homeDir)}/scratch/` : "";
  const isScratch = (path: string) =>
    scratchPrefix !== "" && toPosix(path).startsWith(scratchPrefix);
  const usingTemp = !state.selectedCwd || isScratch(state.selectedCwd);

  useAgentEvents();

  const imagesSupported =
    models.find((model) => modelKey(model) === state.selectedModelKey)?.input.includes("image") ??
    false;

  // Seed the default model/thinking once models load. The working directory is
  // intentionally left unset — a scratch workspace is created on first send.
  useEffect(() => {
    if (state.selectedModelKey || !models.length) return;
    const preferred =
      models.find(
        (model) => model.providerId === defaults.providerId && model.modelId === defaults.modelId,
      ) ?? models[0];
    useChatStore.setState({
      selectedModelKey: preferred ? modelKey(preferred) : "",
      selectedThinking: defaults.thinkingLevel ?? "medium",
    });
  }, [
    defaults.modelId,
    defaults.providerId,
    defaults.thinkingLevel,
    models,
    state.selectedModelKey,
  ]);

  // Extension setTitle: mirror into the window title while this thread is
  // active; restore whatever was there before when it clears or changes.
  const extensionTitle = state.extensionUi.title;
  useEffect(() => {
    if (!extensionTitle) return;
    const previous = document.title;
    document.title = extensionTitle;
    return () => {
      document.title = previous;
    };
  }, [extensionTitle]);

  const workingDirs = useMemo(
    () =>
      [
        ...new Set(
          [
            state.selectedCwd,
            state.active?.cwd,
            ...(sessionsQuery.data ?? []).map((session) => session.cwd),
          ].filter((value): value is string => Boolean(value)),
        ),
      ].filter((path) => !(scratchPrefix !== "" && toPosix(path).startsWith(scratchPrefix))),
    [scratchPrefix, sessionsQuery.data, state.active?.cwd, state.selectedCwd],
  );

  if (profile.isPending || modelsQuery.isPending || defaultsQuery.isPending) {
    return (
      <div className="loading-screen">
        <img src={yuiIconSrc} alt="" />
        <div className="spinner" />
        <p>{t("chat.loading")}</p>
      </div>
    );
  }

  const { statuses, widgets } = state.extensionUi;
  const aboveWidgets = widgets.filter((widget) => widget.placement === "aboveEditor");
  const belowWidgets = widgets.filter((widget) => widget.placement === "belowEditor");
  const hasAboveTray = aboveWidgets.length > 0 || statuses.length > 0;
  const composer = (
    <div className="composer-stack">
      {hasAboveTray && (
        <div className="extension-tray scroll">
          <ExtensionWidgets widgets={aboveWidgets} />
          <ExtensionStatusChips statuses={statuses} />
        </div>
      )}
      <Composer
        input={state.input}
        onInput={state.setInput}
        onSend={conversation.send}
        attachments={state.attachments}
        onAddFiles={addFiles}
        onRemoveAttachment={removeAttachment}
        imagesSupported={imagesSupported}
        models={models}
        selectedModelKey={state.selectedModelKey}
        onModel={conversation.chooseModel}
        cwds={workingDirs}
        cwd={state.selectedCwd}
        usingTemp={usingTemp}
        onCwd={state.setSelectedCwd}
        onBrowseCwd={conversation.browseCwd}
        thinking={state.selectedThinking}
        onThinking={conversation.chooseThinking}
        enabledTools={state.enabledTools}
        onToggleTool={state.toggleTool}
        locked={Boolean(state.active?.sessionId)}
        busy={state.busy}
        onAbort={conversation.abort}
      />
      {belowWidgets.length > 0 && (
        <div className="extension-tray scroll">
          <ExtensionWidgets widgets={belowWidgets} />
        </div>
      )}
    </div>
  );

  return (
    <>
      <ExtensionRequestDialog />
      {state.active || state.messages.length > 0 ? (
        <Thread
          active={state.active}
          messages={state.messages}
          liveTools={state.liveTools}
          queue={state.queue}
          activity={state.activity}
          busy={state.busy}
          workingMessage={state.extensionUi.workingMessage}
          messageStats={state.messageStats}
          runStartedAt={state.runTiming.runStartedAt}
          onOpenCwd={() => void conversation.openDirectory(state.active?.cwd ?? "")}
          composer={composer}
        />
      ) : (
        <EmptyState
          hasModels={models.length > 0}
          onOpenSettings={() => openSettings("providers")}
          composer={composer}
        />
      )}
    </>
  );
}
