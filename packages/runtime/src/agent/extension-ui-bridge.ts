// Bridges Pi's ExtensionUIContext onto Yui contract events. One bridge per
// active session: dialog methods register a pending entry and emit an
// `extension_ui_request`; the answer arrives via respond() (from IPC), or the
// request resolves with its RPC-mode default on timeout / abort / dispose,
// emitting `extension_ui_dismiss`. Fire-and-forget methods emit one-way events
// and update the snapshot that late-subscribing renderers restore from.
// TUI-only APIs no-op exactly like Pi's RPC mode, so ecosystem extensions see
// the canonical non-TUI host behavior without Yui-specific adaptation.

import { randomUUID } from "node:crypto";
import {
  type ExtensionUIContext,
  type ExtensionUIDialogOptions,
  type ExtensionWidgetOptions,
  initTheme,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import type {
  AppAgentEvent,
  ExtensionUiDismissReason,
  ExtensionUiRequest,
  ExtensionUiSnapshot,
  ExtensionWidgetPlacement,
  RespondToExtensionUiInput,
} from "@yui/contracts";

type ExtensionUiResponse = RespondToExtensionUiInput["response"];

interface PendingEntry {
  request: ExtensionUiRequest;
  /** Resolve the dialog. No response means "apply the default value". */
  settle: (response: ExtensionUiResponse | undefined, reason?: ExtensionUiDismissReason) => void;
}

export class ExtensionUiBridge implements ExtensionUIContext {
  /** Insertion order is the FIFO the renderer displays dialogs in. */
  private readonly pending = new Map<string, PendingEntry>();
  private readonly statuses = new Map<string, string>();
  private readonly widgets = new Map<
    string,
    { lines: string[]; placement: ExtensionWidgetPlacement }
  >();
  private workingMessage: string | undefined;
  private title: string | undefined;
  private disposed = false;

  constructor(
    private readonly sessionId: string,
    private readonly emitEvent: (event: AppAgentEvent) => void,
  ) {}

  // --- Yui-facing API (not part of ExtensionUIContext) ----------------------

  /**
   * Answer a pending request. Unknown ids are silently ignored: under the
   * IPC race with timeout/abort/close this is the correct outcome, not an
   * error. Answering does not emit a dismiss event — the renderer already
   * closed the dialog itself.
   */
  respond(requestId: string, response: ExtensionUiResponse): void {
    this.pending.get(requestId)?.settle(response);
  }

  getSnapshot(): ExtensionUiSnapshot {
    return {
      pendingRequests: [...this.pending.values()].map((entry) => entry.request),
      statuses: [...this.statuses].map(([key, text]) => ({ key, text })),
      widgets: [...this.widgets].map(([key, widget]) => ({
        key,
        lines: [...widget.lines],
        placement: widget.placement,
      })),
      workingMessage: this.workingMessage,
      title: this.title,
    };
  }

  /** Resolve all pending dialogs with their defaults and clear the snapshot. */
  dispose(): void {
    if (this.disposed) return;
    // settle() deletes the current entry; removing the current key during Map
    // iteration is well-defined.
    for (const entry of this.pending.values()) {
      entry.settle(undefined, "closed");
    }
    this.disposed = true;
    this.statuses.clear();
    this.widgets.clear();
    this.workingMessage = undefined;
    this.title = undefined;
  }

  // --- Dialog methods --------------------------------------------------------

  select(
    title: string,
    options: string[],
    opts?: ExtensionUIDialogOptions,
  ): Promise<string | undefined> {
    return this.dialog(
      undefined,
      opts,
      (requestId, expiresAt) => ({
        requestId,
        kind: "select",
        title,
        options,
        expiresAt,
      }),
      parseValue,
    );
  }

  confirm(title: string, message: string, opts?: ExtensionUIDialogOptions): Promise<boolean> {
    return this.dialog(
      false,
      opts,
      (requestId, expiresAt) => ({
        requestId,
        kind: "confirm",
        title,
        message,
        expiresAt,
      }),
      parseConfirmed,
    );
  }

  input(
    title: string,
    placeholder?: string,
    opts?: ExtensionUIDialogOptions,
  ): Promise<string | undefined> {
    return this.dialog(
      undefined,
      opts,
      (requestId, expiresAt) => ({
        requestId,
        kind: "input",
        title,
        placeholder,
        expiresAt,
      }),
      parseValue,
    );
  }

  editor(title: string, prefill?: string): Promise<string | undefined> {
    return this.dialog(
      undefined,
      undefined,
      (requestId) => ({
        requestId,
        kind: "editor",
        title,
        prefill,
      }),
      parseValue,
    );
  }

  // --- Fire-and-forget methods ------------------------------------------------

  notify(message: string, type?: "info" | "warning" | "error"): void {
    this.emit({
      type: "extension_notice",
      sessionId: this.sessionId,
      message,
      level: type ?? "info",
    });
  }

  setStatus(key: string, text: string | undefined): void {
    if (this.disposed) return;
    if (text === undefined) {
      this.statuses.delete(key);
    } else {
      this.statuses.set(key, text);
    }
    this.emit({ type: "extension_status_changed", sessionId: this.sessionId, key, text });
  }

  setWidget(key: string, content: unknown, options?: ExtensionWidgetOptions): void {
    if (this.disposed) return;
    // Component factories require TUI access and are ignored, like RPC mode.
    if (content !== undefined && !Array.isArray(content)) return;
    const lines = content as string[] | undefined;
    const placement: ExtensionWidgetPlacement = options?.placement ?? "aboveEditor";
    if (lines === undefined) {
      this.widgets.delete(key);
    } else {
      this.widgets.set(key, { lines: [...lines], placement });
    }
    this.emit({
      type: "extension_widget_changed",
      sessionId: this.sessionId,
      key,
      lines,
      placement,
    });
  }

  setTitle(title: string): void {
    if (this.disposed) return;
    this.title = title;
    this.emit({ type: "extension_title_changed", sessionId: this.sessionId, title });
  }

  setWorkingMessage(message?: string): void {
    if (this.disposed) return;
    this.workingMessage = message;
    this.emit({ type: "extension_working_message_changed", sessionId: this.sessionId, message });
  }

  setEditorText(text: string): void {
    this.emit({ type: "extension_editor_set_text", sessionId: this.sessionId, text });
  }

  pasteToEditor(text: string): void {
    // No paste-collapse handling outside the TUI; same fallback as RPC mode.
    this.setEditorText(text);
  }

  // --- TUI-only APIs: no-op / RPC-mode defaults --------------------------------

  onTerminalInput(): () => void {
    return () => {};
  }

  setWorkingVisible(): void {}

  setWorkingIndicator(): void {}

  setHiddenThinkingLabel(): void {}

  setFooter(): void {}

  setHeader(): void {}

  async custom<T>(): Promise<T> {
    return undefined as never;
  }

  getEditorText(): string {
    return "";
  }

  addAutocompleteProvider(): void {}

  setEditorComponent(): void {}

  getEditorComponent(): undefined {
    return undefined;
  }

  get theme(): Theme {
    return getPiTheme();
  }

  getAllThemes(): { name: string; path: string | undefined }[] {
    return [];
  }

  getTheme(): Theme | undefined {
    return undefined;
  }

  setTheme(): { success: boolean; error?: string } {
    return { success: false, error: "Theme switching is not supported in this host" };
  }

  getToolsExpanded(): boolean {
    return false;
  }

  setToolsExpanded(): void {}

  // --- Internals ----------------------------------------------------------------

  private dialog<T>(
    defaultValue: T,
    opts: ExtensionUIDialogOptions | undefined,
    buildRequest: (requestId: string, expiresAt: number | undefined) => ExtensionUiRequest,
    parse: (response: ExtensionUiResponse, defaultValue: T) => T,
  ): Promise<T> {
    if (this.disposed || opts?.signal?.aborted) return Promise.resolve(defaultValue);

    const requestId = randomUUID();
    const expiresAt = opts?.timeout ? Date.now() + opts.timeout : undefined;
    const request = buildRequest(requestId, expiresAt);

    return new Promise<T>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const onAbort = () => settle(undefined, "aborted");
      const settle = (
        response: ExtensionUiResponse | undefined,
        reason?: ExtensionUiDismissReason,
      ) => {
        if (timer) clearTimeout(timer);
        opts?.signal?.removeEventListener("abort", onAbort);
        this.pending.delete(requestId);
        if (reason) {
          this.emit({
            type: "extension_ui_dismiss",
            sessionId: this.sessionId,
            requestId,
            reason,
          });
        }
        resolve(response === undefined ? defaultValue : parse(response, defaultValue));
      };

      opts?.signal?.addEventListener("abort", onAbort, { once: true });
      if (opts?.timeout) {
        timer = setTimeout(() => settle(undefined, "timeout"), opts.timeout);
      }
      this.pending.set(requestId, { request, settle });
      this.emit({ type: "extension_ui_request", sessionId: this.sessionId, request });
    });
  }

  private emit(event: AppAgentEvent): void {
    if (this.disposed) return;
    this.emitEvent(event);
  }
}

function parseValue(
  response: ExtensionUiResponse,
  defaultValue: string | undefined,
): string | undefined {
  return response.kind === "value" ? response.value : defaultValue;
}

function parseConfirmed(response: ExtensionUiResponse, defaultValue: boolean): boolean {
  return response.kind === "confirmed" ? response.confirmed : defaultValue;
}

// Pi keeps its theme in a lazily initialized global; extensions style widget
// lines through `ctx.ui.theme`, so the host must ensure it is initialized
// before handing it out. The global symbol is Pi's cross-loader sharing key.
function getPiTheme(): Theme {
  const key = Symbol.for("@earendil-works/pi-coding-agent:theme");
  const existing = (globalThis as Record<symbol, Theme | undefined>)[key];
  if (existing) return existing;
  initTheme();
  return (globalThis as Record<symbol, Theme | undefined>)[key] as Theme;
}
