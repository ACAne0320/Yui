import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AppAgentEvent } from "./agent.ts";
import { openSessionInputSchema, promptInputSchema } from "./agent.ts";
import { respondToOAuthLoginInputSchema, setApiKeyInputSchema } from "./auth.ts";
import { respondToExtensionUiInputSchema } from "./extensions.ts";
import {
  personaConfigSchema,
  personaScopeSchema,
  recallInputSchema,
  rememberInputSchema,
  saveSoulInputSchema,
} from "./persona.ts";
import { AppRuntimeError } from "./runtime.ts";

describe("input schemas", () => {
  it("accepts a valid open-session input and rejects a missing cwd", () => {
    expect(openSessionInputSchema.safeParse({ cwd: "/tmp/work" }).success).toBe(true);
    expect(
      openSessionInputSchema.safeParse({ cwd: "/tmp/work", persona: { memory: false } }).success,
    ).toBe(true);
    expect(openSessionInputSchema.safeParse({ providerId: "anthropic" }).success).toBe(false);
  });

  it("rejects an empty prompt and an empty session id", () => {
    expect(promptInputSchema.safeParse({ sessionId: "s1", text: "hi" }).success).toBe(true);
    expect(promptInputSchema.safeParse({ sessionId: "s1", text: "" }).success).toBe(false);
    expect(promptInputSchema.safeParse({ sessionId: "", text: "hi" }).success).toBe(false);
  });

  it("accepts image attachments and rejects malformed ones", () => {
    const image = { type: "image", data: "aGVsbG8=", mimeType: "image/png" };
    expect(
      promptInputSchema.safeParse({ sessionId: "s1", text: "hi", images: [image] }).success,
    ).toBe(true);
    // images is optional
    expect(promptInputSchema.safeParse({ sessionId: "s1", text: "hi" }).success).toBe(true);
    // empty data / mimeType rejected
    expect(
      promptInputSchema.safeParse({
        sessionId: "s1",
        text: "hi",
        images: [{ type: "image", data: "", mimeType: "image/png" }],
      }).success,
    ).toBe(false);
    expect(
      promptInputSchema.safeParse({
        sessionId: "s1",
        text: "hi",
        images: [{ type: "image", data: "aGVsbG8=", mimeType: "" }],
      }).success,
    ).toBe(false);
    // wrong literal type rejected
    expect(
      promptInputSchema.safeParse({
        sessionId: "s1",
        text: "hi",
        images: [{ type: "file", data: "aGVsbG8=", mimeType: "image/png" }],
      }).success,
    ).toBe(false);
  });

  it("accepts every extension UI response kind", () => {
    const base = { sessionId: "s1", requestId: "r1" };
    const responses = [
      { kind: "value", value: "" },
      { kind: "value", value: "picked option" },
      { kind: "confirmed", confirmed: true },
      { kind: "confirmed", confirmed: false },
      { kind: "cancelled" },
    ];
    for (const response of responses) {
      expect(respondToExtensionUiInputSchema.safeParse({ ...base, response }).success).toBe(true);
    }
  });

  it("rejects extension UI responses with empty ids or an unknown kind", () => {
    const response = { kind: "cancelled" };
    expect(
      respondToExtensionUiInputSchema.safeParse({ sessionId: "", requestId: "r1", response })
        .success,
    ).toBe(false);
    expect(
      respondToExtensionUiInputSchema.safeParse({ sessionId: "s1", requestId: "", response })
        .success,
    ).toBe(false);
    expect(
      respondToExtensionUiInputSchema.safeParse({
        sessionId: "s1",
        requestId: "r1",
        response: { kind: "dismissed" },
      }).success,
    ).toBe(false);
    expect(
      respondToExtensionUiInputSchema.safeParse({
        sessionId: "s1",
        requestId: "r1",
        response: { kind: "confirmed", value: "yes" },
      }).success,
    ).toBe(false);
  });

  it("rejects an empty api key", () => {
    expect(
      setApiKeyInputSchema.safeParse({ providerId: "anthropic", apiKey: "sk-x" }).success,
    ).toBe(true);
    expect(setApiKeyInputSchema.safeParse({ providerId: "anthropic", apiKey: "" }).success).toBe(
      false,
    );
  });

  it("accepts persona DTOs and rejects malformed memory tool inputs", () => {
    expect(personaConfigSchema.safeParse({ memoryEnabled: true }).success).toBe(true);
    expect(
      personaScopeSchema.safeParse({ soul: true, globalMemory: false, cwdMemory: true }).success,
    ).toBe(true);
    expect(saveSoulInputSchema.safeParse({ content: "# Yui" }).success).toBe(true);
    expect(
      rememberInputSchema.safeParse({ text: "prefers concise replies", scope: "global" }).success,
    ).toBe(true);
    expect(rememberInputSchema.safeParse({ text: "x", scope: "project" }).success).toBe(false);
    expect(recallInputSchema.safeParse({ query: "concise" }).success).toBe(true);
    expect(recallInputSchema.safeParse({ query: "" }).success).toBe(false);
  });

  it("accepts OAuth login responses and rejects empty flow ids", () => {
    expect(
      respondToOAuthLoginInputSchema.safeParse({
        flowId: "flow-1",
        requestId: "request-1",
        response: { kind: "value", value: "browser" },
      }).success,
    ).toBe(true);
    expect(
      respondToOAuthLoginInputSchema.safeParse({
        flowId: "",
        requestId: "request-1",
        response: { kind: "cancelled" },
      }).success,
    ).toBe(false);
  });
});

describe("serialization", () => {
  it("round-trips agent events through JSON unchanged", () => {
    const events: AppAgentEvent[] = [
      {
        type: "message_update",
        sessionId: "s1",
        message: {
          id: "m1",
          role: "assistant",
          content: [{ type: "text", text: "hi" }],
          timestamp: 1,
        },
        stream: { kind: "text_delta", contentIndex: 0, delta: "hi" },
      },
      {
        type: "tool_execution_end",
        sessionId: "s1",
        toolCallId: "t1",
        toolName: "read",
        result: { ok: true },
        isError: false,
      },
      { type: "queue_update", sessionId: "s1", steering: ["a"], followUp: [] },
      {
        type: "extension_ui_request",
        sessionId: "s1",
        request: {
          requestId: "r1",
          kind: "select",
          title: "Pick one",
          options: ["a", "b"],
          expiresAt: 1700000000000,
        },
      },
      {
        type: "extension_ui_request",
        sessionId: "s1",
        request: { requestId: "r2", kind: "confirm", title: "Allow?", message: "Run the tool?" },
      },
      { type: "extension_ui_dismiss", sessionId: "s1", requestId: "r1", reason: "timeout" },
      { type: "extension_notice", sessionId: "s1", message: "loaded", level: "info" },
      { type: "extension_status_changed", sessionId: "s1", key: "vim", text: "INSERT" },
      {
        type: "extension_widget_changed",
        sessionId: "s1",
        key: "todo",
        lines: ["[ ] task"],
        placement: "aboveEditor",
      },
      { type: "extension_title_changed", sessionId: "s1", title: "My Session" },
      { type: "extension_working_message_changed", sessionId: "s1", message: "Crunching..." },
      { type: "extension_editor_set_text", sessionId: "s1", text: "draft" },
      {
        type: "message_start",
        sessionId: "s1",
        message: {
          id: "m2",
          role: "user",
          content: [
            { type: "text", text: "what is this?" },
            { type: "image", mimeType: "image/png", attachmentId: "sha256-abc" },
          ],
          timestamp: 2,
        },
      },
    ];
    for (const event of events) {
      expect(JSON.parse(JSON.stringify(event))).toEqual(event);
    }
  });

  it("serializes AppRuntimeError to a stable error DTO", () => {
    const err = new AppRuntimeError("session_busy", "session is streaming", { sessionId: "s1" });
    expect(err.toJSON()).toEqual({
      code: "session_busy",
      message: "session is streaming",
      details: { sessionId: "s1" },
    });
  });

  it("serializes persona contracts and keeps persona.ts Pi-free", () => {
    const persona = {
      config: { memoryEnabled: true },
      scope: { soul: true, globalMemory: true, cwdMemory: false },
      soul: { content: "You are Yui.", path: "/tmp/persona/SOUL.md" },
    };
    expect(JSON.parse(JSON.stringify(persona))).toEqual(persona);
    expect(readFileSync(new URL("./persona.ts", import.meta.url), "utf-8")).not.toContain(
      "@earendil-works/pi-",
    );
  });
});
