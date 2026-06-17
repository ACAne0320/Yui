import { describe, expect, it } from "vitest";
import { imageAttachmentId } from "./attachment-id.ts";
import { mapAgentMessage } from "./message-mapper.ts";

// The mapper is pure given an id; Pi types are erased so no Pi runtime is needed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const m = (msg: Record<string, unknown>) => mapAgentMessage(msg as any, "id1");

describe("mapAgentMessage", () => {
  it("maps a string-content user message to a single text block", () => {
    const app = m({ role: "user", content: "hello", timestamp: 1 });
    expect(app).toMatchObject({
      id: "id1",
      role: "user",
      content: [{ type: "text", text: "hello" }],
      timestamp: 1,
    });
  });

  it("maps an assistant message with text + toolCall blocks and usage", () => {
    const app = m({
      role: "assistant",
      provider: "anthropic",
      model: "claude-x",
      stopReason: "toolUse",
      timestamp: 2,
      content: [
        { type: "text", text: "ok" },
        { type: "toolCall", id: "tc1", name: "read", arguments: { path: "a" } },
      ],
      usage: {
        input: 1,
        output: 2,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 3,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    });
    expect(app.role).toBe("assistant");
    expect(app.providerId).toBe("anthropic");
    expect(app.content).toEqual([
      { type: "text", text: "ok" },
      { type: "toolCall", id: "tc1", name: "read", arguments: { path: "a" } },
    ]);
    expect(app.usage?.totalTokens).toBe(3);
  });

  it("maps a toolResult message with its tool metadata", () => {
    const app = m({
      role: "toolResult",
      toolCallId: "tc1",
      toolName: "read",
      isError: false,
      timestamp: 3,
      content: [{ type: "text", text: "file contents" }],
    });
    expect(app).toMatchObject({
      role: "toolResult",
      toolCallId: "tc1",
      toolName: "read",
      isError: false,
    });
  });

  it("maps a compaction summary to its own role with the summary text and token count", () => {
    const app = m({
      role: "compactionSummary",
      summary: "did stuff",
      tokensBefore: 1234,
      timestamp: 4,
    });
    expect(app).toMatchObject({
      role: "compactionSummary",
      content: [{ type: "text", text: "did stuff" }],
      tokensBefore: 1234,
    });
  });

  it("maps a branch summary to its own role with the summary text", () => {
    const app = m({ role: "branchSummary", summary: "abandoned path", fromId: "e3", timestamp: 5 });
    expect(app).toMatchObject({
      role: "branchSummary",
      content: [{ type: "text", text: "abandoned path" }],
    });
  });

  it("maps a bash execution with its command, output, and error state", () => {
    const ok = m({
      role: "bashExecution",
      command: "ls",
      output: "a\nb",
      exitCode: 0,
      timestamp: 6,
    });
    expect(ok).toMatchObject({
      role: "bashExecution",
      command: "ls",
      content: [{ type: "text", text: "a\nb" }],
      exitCode: 0,
      isError: false,
    });
    const failed = m({ role: "bashExecution", command: "boom", exitCode: 2, timestamp: 7 });
    expect(failed).toMatchObject({ role: "bashExecution", exitCode: 2, isError: true });
    const cancelled = m({
      role: "bashExecution",
      command: "sleep 9",
      cancelled: true,
      timestamp: 8,
    });
    expect(cancelled).toMatchObject({ role: "bashExecution", isError: true });
  });

  it("maps a displayed custom message with its type and content", () => {
    const app = m({
      role: "custom",
      customType: "note",
      content: "hello",
      display: true,
      timestamp: 9,
    });
    expect(app).toMatchObject({
      role: "custom",
      customType: "note",
      content: [{ type: "text", text: "hello" }],
    });
  });

  it("emits no content for a hidden (display:false) custom message", () => {
    const app = m({
      role: "custom",
      customType: "state",
      content: "secret",
      display: false,
      timestamp: 10,
    });
    expect(app).toMatchObject({ role: "custom", customType: "state", content: [] });
  });

  it("maps an image content block to a content-addressed reference, dropping the bytes", () => {
    const data = "aGVsbG8gaW1hZ2U=";
    const app = m({
      role: "user",
      timestamp: 12,
      content: [
        { type: "text", text: "what is this?" },
        { type: "image", data, mimeType: "image/png" },
      ],
    });
    expect(app.content).toEqual([
      { type: "text", text: "what is this?" },
      { type: "image", mimeType: "image/png", attachmentId: imageAttachmentId(data) },
    ]);
    // The bytes must not leak into the event payload.
    expect(JSON.stringify(app)).not.toContain(data);
  });

  it("gives identical image bytes the same attachmentId", () => {
    const data = "c2FtZS1ieXRlcw==";
    const a = m({
      role: "user",
      timestamp: 13,
      content: [{ type: "image", data, mimeType: "image/jpeg" }],
    });
    const b = m({
      role: "toolResult",
      toolCallId: "t1",
      toolName: "x",
      isError: false,
      timestamp: 14,
      content: [{ type: "image", data, mimeType: "image/jpeg" }],
    });
    const idA = (a.content[0] as { attachmentId: string }).attachmentId;
    const idB = (b.content[0] as { attachmentId: string }).attachmentId;
    expect(idA).toBe(idB);
  });

  it("keeps a genuinely unknown role from crashing, as an empty custom message", () => {
    const app = m({ role: "somethingNew", timestamp: 11 });
    expect(app).toMatchObject({ role: "custom", content: [], timestamp: 11 });
  });
});
