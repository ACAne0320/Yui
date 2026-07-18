import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AppModel } from "@yui/contracts";
import { displayPath, shortPath } from "@renderer/lib/format";
import { modelKey } from "@renderer/lib/model";
import { providerLabel } from "@renderer/lib/providers";
import { Icon } from "@renderer/ui/Icon";
import { Popover } from "@renderer/ui/Popover";
import { ProviderLogo } from "@renderer/ui/ProviderLogo";
import { SmoothCaret } from "@renderer/ui/SmoothCaret";
import { fallbackThinkingLevels, thinkingLabelKeys } from "../constants";
import { type SlashCommand, filterSlashCommands, slashQuery } from "../slash-commands";
import type { ComposerProps } from "../types";
import { ContextGauge } from "./ContextGauge";
import { SlashCommandMenu } from "./SlashCommandMenu";

export function Composer({
  input,
  onInput,
  onSend,
  slashCommands,
  attachments,
  onAddFiles,
  onRemoveAttachment,
  imagesSupported,
  models,
  selectedModelKey,
  onModel,
  cwds,
  cwd,
  usingTemp,
  onCwd,
  onBrowseCwd,
  thinking,
  onThinking,
  noMemory,
  onToggleNoMemory,
  locked = false,
  busy = false,
  onAbort,
}: ComposerProps) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);
  const compositionEndTimerRef = useRef<number | undefined>(undefined);
  const [dragging, setDragging] = useState(false);
  const selectedModel = models.find((model) => modelKey(model) === selectedModelKey);
  // Group models by provider for the picker, preserving the order each provider
  // and its models arrive in from the runtime.
  const modelGroups = useMemo(() => {
    const groups = new Map<string, AppModel[]>();
    for (const model of models) {
      const list = groups.get(model.providerId);
      if (list) list.push(model);
      else groups.set(model.providerId, [model]);
    }
    return [...groups];
  }, [models]);
  const availableLevels = selectedModel?.availableThinkingLevels.length
    ? selectedModel.availableThinkingLevels
    : fallbackThinkingLevels;

  // Slash-command menu: opens when the whole input is "/" + a partial command
  // name. Escape dismisses it until the next keystroke.
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const slashFilter = slashQuery(input);
  const slashMatches = useMemo(
    () => (slashFilter === null ? [] : filterSlashCommands(slashCommands, slashFilter)),
    [slashFilter, slashCommands],
  );
  const slashOpen = slashFilter !== null && !slashDismissed && slashMatches.length > 0;
  const slashActiveIndex = Math.min(slashIndex, Math.max(0, slashMatches.length - 1));

  useEffect(() => {
    setSlashIndex(0);
  }, [slashFilter]);

  const handleInput = (value: string) => {
    setSlashDismissed(false);
    onInput(value);
  };

  const activateSlash = (command: SlashCommand) => {
    command.run();
    // Clearing the "/..." draft also closes the menu.
    onInput("");
  };

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [input]);

  useEffect(
    () => () => {
      window.clearTimeout(compositionEndTimerRef.current);
    },
    [],
  );

  // Pull image files out of a clipboard paste. Uses the `paste` event's
  // clipboardData (allowed) rather than navigator.clipboard.read (denied by the
  // window security policy). Attaching is always allowed; an unsupported model
  // is surfaced as a warning, not a block, since the model can be switched here.
  const handlePaste = (event: React.ClipboardEvent) => {
    const files = Array.from(event.clipboardData.files).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (files.length === 0) return;
    event.preventDefault();
    onAddFiles(files);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length > 0) onAddFiles(event.dataTransfer.files);
  };

  const handleDragOver = (event: React.DragEvent) => {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    setDragging(true);
  };

  return (
    <div className="composer-wrap">
      {slashOpen && (
        <SlashCommandMenu
          commands={slashMatches}
          activeIndex={slashActiveIndex}
          onHover={setSlashIndex}
          onActivate={activateSlash}
        />
      )}
      <div
        className="composer"
        data-dragging={dragging || undefined}
        onDragOver={handleDragOver}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        {attachments.length > 0 && (
          <div className="composer-attachments">
            {attachments.map((attachment) => (
              <div className="composer-attachment" key={attachment.id}>
                <img src={attachment.objectUrl} alt={attachment.name} />
                <button
                  className="composer-attachment-remove"
                  title={t("chat.composer.attachments.remove")}
                  onClick={() => onRemoveAttachment(attachment.id)}
                >
                  <Icon name="close" size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
        {attachments.length > 0 && !imagesSupported && (
          <div className="composer-attachment-warning">
            <Icon name="info" size={13} />
            <span>{t("chat.composer.attachments.modelUnsupported")}</span>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files) onAddFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <textarea
          ref={textareaRef}
          value={input}
          rows={1}
          placeholder={
            busy ? t("chat.composer.followUpPlaceholder") : t("chat.composer.placeholder")
          }
          onPaste={handlePaste}
          onChange={(event) => handleInput(event.target.value)}
          onCompositionEnd={() => {
            compositionEndTimerRef.current = window.setTimeout(() => {
              composingRef.current = false;
            }, 0);
          }}
          onCompositionStart={() => {
            window.clearTimeout(compositionEndTimerRef.current);
            composingRef.current = true;
          }}
          onKeyDown={(event) => {
            const isComposing =
              composingRef.current ||
              event.nativeEvent.isComposing ||
              event.nativeEvent.keyCode === 229;

            // The slash menu owns navigation keys while it is open (and not
            // mid-IME). Shift+Enter falls through to insert a newline.
            if (slashOpen && !isComposing) {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSlashIndex((value) => Math.min(value + 1, slashMatches.length - 1));
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setSlashIndex((value) => Math.max(value - 1, 0));
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setSlashDismissed(true);
                return;
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                const command = slashMatches[slashActiveIndex];
                if (command) activateSlash(command);
                return;
              }
            }

            if (event.key === "Enter" && !event.shiftKey) {
              if (isComposing) {
                return;
              }
              event.preventDefault();
              void onSend();
            }
          }}
        />
        <SmoothCaret textareaRef={textareaRef} value={input} />
        <div className="composer-bar">
          <button
            className="composer-button"
            title={t("chat.composer.attachImage")}
            onClick={() => fileInputRef.current?.click()}
          >
            <Icon name="plus" size={15} />
          </button>
          <Popover
            trigger={
              <button className="composer-button" title={t("chat.composer.workingDirectory")}>
                <Icon name="folder" size={15} />
                <span className="compact-label">
                  {usingTemp ? t("chat.composer.temporaryDirectory") : shortPath(cwd)}
                </span>
              </button>
            }
          >
            <div className="popover-title">{t("chat.composer.workingDirectory")}</div>
            {locked && <div className="popover-note">{t("chat.composer.lockedDirectory")}</div>}
            <button
              className="popover-item"
              data-active={usingTemp}
              disabled={locked}
              onClick={() => onCwd("")}
            >
              <Icon name="clock" size={14} />
              <span>{t("chat.composer.useTemporaryDirectory")}</span>
              {usingTemp && <Icon name="check" size={13} />}
            </button>
            {cwds.map((item) => (
              <button
                key={item}
                className="popover-item"
                data-active={!usingTemp && item === cwd}
                disabled={locked}
                onClick={() => onCwd(item)}
              >
                <Icon name="folder" size={14} />
                <span>{displayPath(item)}</span>
                {!usingTemp && item === cwd && <Icon name="check" size={13} />}
              </button>
            ))}
            <div className="popover-section">
              <button className="popover-item" disabled={locked} onClick={() => void onBrowseCwd()}>
                <Icon name="folder" size={14} />
                <span>{t("chat.composer.chooseDirectory")}</span>
              </button>
            </div>
          </Popover>

          <div className="composer-spacer" />

          <ContextGauge />

          <Popover
            align="end"
            trigger={
              <button className="model-button" title={t("chat.composer.model")}>
                <ProviderLogo id={selectedModel?.providerId ?? ""} size={14} />
                <span>{selectedModel?.name ?? t("chat.composer.chooseModel")}</span>
                <Icon name="chevron" size={12} />
              </button>
            }
          >
            {modelGroups.length ? (
              modelGroups.map(([providerId, group]) => (
                <div className="model-group" key={providerId}>
                  <div className="model-group-header">
                    <ProviderLogo id={providerId} size={15} />
                    <span>{providerLabel(providerId)}</span>
                  </div>
                  {group.map((model) => (
                    <button
                      className="popover-item model-option"
                      key={modelKey(model)}
                      data-active={modelKey(model) === selectedModelKey}
                      onClick={() => onModel(modelKey(model))}
                    >
                      <span>
                        {model.name}
                        <small>{Math.round(model.contextWindow / 1000)}K context</small>
                      </span>
                      {modelKey(model) === selectedModelKey && <Icon name="check" size={13} />}
                    </button>
                  ))}
                </div>
              ))
            ) : (
              <div className="popover-empty">{t("chat.composer.noModels")}</div>
            )}
          </Popover>

          <Popover
            align="end"
            trigger={
              <button className="composer-button thinking-button" data-level={thinking}>
                <Icon name="spark" size={15} />
                <span>{t(thinkingLabelKeys[thinking])}</span>
              </button>
            }
          >
            <div className="popover-title">{t("chat.composer.thinkingLevel")}</div>
            {availableLevels.map((level) => (
              <button
                className="popover-item thinking-option"
                key={level}
                data-active={level === thinking}
                onClick={() => onThinking(level)}
              >
                <i data-level={level} />
                <span>{t(thinkingLabelKeys[level])}</span>
                {level === thinking && <Icon name="check" size={13} />}
              </button>
            ))}
          </Popover>

          {!locked && (
            <button
              className="composer-button"
              data-active={noMemory || undefined}
              title={noMemory ? t("chat.composer.incognitoOn") : t("chat.composer.incognitoOff")}
              onClick={onToggleNoMemory}
            >
              <Icon name={noMemory ? "eyeOff" : "eye"} size={15} />
            </button>
          )}

          {busy && onAbort && (
            <button
              className="abort-button"
              onClick={() => void onAbort()}
              title={t("chat.composer.stop")}
            >
              <span />
            </button>
          )}
          <button
            className="send-button"
            disabled={!input.trim()}
            onClick={() => void onSend()}
            title={t("chat.composer.send")}
          >
            <Icon name="send" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
