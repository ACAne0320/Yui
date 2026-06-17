import type { AppAgentEvent } from "@yui/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExtensionUiBridge } from "./extension-ui-bridge.ts";

function createBridge() {
  const events: AppAgentEvent[] = [];
  const bridge = new ExtensionUiBridge("s1", (event) => events.push(event));
  return { bridge, events };
}

function lastRequestId(events: AppAgentEvent[]): string {
  const event = events.findLast((e) => e.type === "extension_ui_request");
  if (event?.type !== "extension_ui_request") throw new Error("no extension_ui_request emitted");
  return event.request.requestId;
}

describe("ExtensionUiBridge dialogs", () => {
  it("emits a select request and resolves with the answered value", async () => {
    const { bridge, events } = createBridge();
    const result = bridge.select("Pick", ["a", "b"]);

    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event.type).toBe("extension_ui_request");
    if (event.type !== "extension_ui_request") return;
    expect(event.request).toMatchObject({ kind: "select", title: "Pick", options: ["a", "b"] });

    bridge.respond(event.request.requestId, { kind: "value", value: "b" });
    await expect(result).resolves.toBe("b");
    // Answering does not emit a dismiss; the renderer closed the dialog itself.
    expect(events.filter((e) => e.type === "extension_ui_dismiss")).toHaveLength(0);
    expect(bridge.getSnapshot().pendingRequests).toHaveLength(0);
  });

  it("resolves confirm with the answered boolean and cancelled as false", async () => {
    const { bridge, events } = createBridge();
    const confirmed = bridge.confirm("Allow?", "Run the tool?");
    bridge.respond(lastRequestId(events), { kind: "confirmed", confirmed: true });
    await expect(confirmed).resolves.toBe(true);

    const cancelled = bridge.confirm("Allow?", "Run the tool?");
    bridge.respond(lastRequestId(events), { kind: "cancelled" });
    await expect(cancelled).resolves.toBe(false);
  });

  it("resolves input/editor with the value, and cancelled as undefined", async () => {
    const { bridge, events } = createBridge();
    const input = bridge.input("Name?", "placeholder");
    bridge.respond(lastRequestId(events), { kind: "value", value: "yui" });
    await expect(input).resolves.toBe("yui");

    const editor = bridge.editor("Edit", "prefill");
    const editorEvent = events.at(-1);
    expect(editorEvent).toMatchObject({
      type: "extension_ui_request",
      request: { kind: "editor", title: "Edit", prefill: "prefill" },
    });
    bridge.respond(lastRequestId(events), { kind: "cancelled" });
    await expect(editor).resolves.toBeUndefined();
  });

  it("resolves a mismatched response kind with the default value", async () => {
    const { bridge, events } = createBridge();
    const confirmed = bridge.confirm("Allow?", "Run?");
    bridge.respond(lastRequestId(events), { kind: "value", value: "yes" });
    await expect(confirmed).resolves.toBe(false);
  });

  it("ignores unknown request ids and double answers", async () => {
    const { bridge, events } = createBridge();
    bridge.respond("nope", { kind: "cancelled" });

    const result = bridge.select("Pick", ["a"]);
    const id = lastRequestId(events);
    bridge.respond(id, { kind: "value", value: "a" });
    bridge.respond(id, { kind: "value", value: "ignored" });
    await expect(result).resolves.toBe("a");
  });
});

describe("ExtensionUiBridge timeout and abort", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves the default on timeout and emits a timeout dismiss", async () => {
    const { bridge, events } = createBridge();
    const confirmed = bridge.confirm("Allow?", "Run?", { timeout: 5000 });

    const request = events[0];
    if (request.type !== "extension_ui_request" || request.request.kind !== "confirm") {
      throw new Error("expected confirm request");
    }
    expect(request.request.expiresAt).toBe(Date.now() + 5000);

    vi.advanceTimersByTime(5000);
    await expect(confirmed).resolves.toBe(false);
    expect(events.at(-1)).toEqual({
      type: "extension_ui_dismiss",
      sessionId: "s1",
      requestId: request.request.requestId,
      reason: "timeout",
    });
    expect(bridge.getSnapshot().pendingRequests).toHaveLength(0);
  });

  it("late answers after a timeout are silently ignored", async () => {
    const { bridge, events } = createBridge();
    const result = bridge.select("Pick", ["a"], { timeout: 1000 });
    const id = lastRequestId(events);
    vi.advanceTimersByTime(1000);
    bridge.respond(id, { kind: "value", value: "a" });
    await expect(result).resolves.toBeUndefined();
  });

  it("resolves the default on abort and emits an aborted dismiss", async () => {
    const { bridge, events } = createBridge();
    const controller = new AbortController();
    const result = bridge.input("Name?", undefined, { signal: controller.signal });
    controller.abort();
    await expect(result).resolves.toBeUndefined();
    expect(events.at(-1)).toMatchObject({ type: "extension_ui_dismiss", reason: "aborted" });
  });

  it("resolves immediately without events when the signal is already aborted", async () => {
    const { bridge, events } = createBridge();
    const controller = new AbortController();
    controller.abort();
    const confirmed = bridge.confirm("Allow?", "Run?", { signal: controller.signal });
    await expect(confirmed).resolves.toBe(false);
    expect(events).toHaveLength(0);
  });
});

describe("ExtensionUiBridge snapshot", () => {
  it("tracks statuses, widgets, title, and working message with key overwrite semantics", () => {
    const { bridge } = createBridge();
    bridge.setStatus("vim", "NORMAL");
    bridge.setStatus("vim", "INSERT");
    bridge.setStatus("clock", "12:00");
    bridge.setWidget("todo", ["[ ] a"], { placement: "belowEditor" });
    bridge.setWidget("todo", ["[x] a"], { placement: "belowEditor" });
    bridge.setTitle("My Session");
    bridge.setWorkingMessage("Crunching...");

    expect(bridge.getSnapshot()).toEqual({
      pendingRequests: [],
      statuses: [
        { key: "vim", text: "INSERT" },
        { key: "clock", text: "12:00" },
      ],
      widgets: [{ key: "todo", lines: ["[x] a"], placement: "belowEditor" }],
      workingMessage: "Crunching...",
      title: "My Session",
    });

    bridge.setStatus("vim", undefined);
    bridge.setWidget("todo", undefined);
    bridge.setWorkingMessage();
    const snapshot = bridge.getSnapshot();
    expect(snapshot.statuses).toEqual([{ key: "clock", text: "12:00" }]);
    expect(snapshot.widgets).toEqual([]);
    expect(snapshot.workingMessage).toBeUndefined();
  });

  it("keeps pending requests in FIFO order and ignores widget component factories", () => {
    const { bridge, events } = createBridge();
    void bridge.confirm("first", "1");
    void bridge.select("second", ["a"]);
    expect(bridge.getSnapshot().pendingRequests.map((r) => r.kind)).toEqual(["confirm", "select"]);

    bridge.setWidget("custom", () => ({}) as never);
    expect(events.filter((e) => e.type === "extension_widget_changed")).toHaveLength(0);
    expect(bridge.getSnapshot().widgets).toEqual([]);
  });

  it("emits notice events for notify with info default", () => {
    const { bridge, events } = createBridge();
    bridge.notify("hello");
    bridge.notify("boom", "error");
    expect(events).toEqual([
      { type: "extension_notice", sessionId: "s1", message: "hello", level: "info" },
      { type: "extension_notice", sessionId: "s1", message: "boom", level: "error" },
    ]);
  });

  it("emits editor text events for setEditorText and pasteToEditor", () => {
    const { bridge, events } = createBridge();
    bridge.setEditorText("draft");
    bridge.pasteToEditor("pasted");
    expect(events).toEqual([
      { type: "extension_editor_set_text", sessionId: "s1", text: "draft" },
      { type: "extension_editor_set_text", sessionId: "s1", text: "pasted" },
    ]);
  });
});

describe("ExtensionUiBridge dispose", () => {
  it("resolves all pending dialogs with defaults and emits closed dismissals", async () => {
    const { bridge, events } = createBridge();
    const confirmed = bridge.confirm("Allow?", "Run?");
    const selected = bridge.select("Pick", ["a"]);
    bridge.setStatus("vim", "INSERT");

    bridge.dispose();
    await expect(confirmed).resolves.toBe(false);
    await expect(selected).resolves.toBeUndefined();

    const dismissals = events.filter((e) => e.type === "extension_ui_dismiss");
    expect(dismissals.map((e) => e.type === "extension_ui_dismiss" && e.reason)).toEqual([
      "closed",
      "closed",
    ]);
    expect(bridge.getSnapshot()).toEqual({
      pendingRequests: [],
      statuses: [],
      widgets: [],
      workingMessage: undefined,
      title: undefined,
    });
  });

  it("is inert after dispose: dialogs resolve defaults and nothing is emitted", async () => {
    const { bridge, events } = createBridge();
    bridge.dispose();
    const count = events.length;

    await expect(bridge.confirm("Allow?", "Run?")).resolves.toBe(false);
    bridge.notify("hello");
    bridge.setStatus("k", "v");
    expect(events).toHaveLength(count);
    expect(bridge.getSnapshot().statuses).toEqual([]);
  });
});
