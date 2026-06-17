import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeConfig } from "@yui/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { imageAttachmentId } from "../agent/attachment-id.ts";
import { PiSessionCatalog } from "./session-catalog.ts";

let home: string;
let sessionDir: string;

function config(cwd: string): RuntimeConfig {
  const agentDir = join(home, "agent");
  return { homeDir: home, agentDir, sessionDir, cwd };
}

/** Write a minimal v3 session JSONL: header + a user/assistant exchange. */
function writeSession(
  file: string,
  cwd: string,
  opts: { user: string; assistant?: string; name?: string },
): void {
  const lines: unknown[] = [
    { type: "session", version: 3, id: file, timestamp: "2026-06-07T00:00:00.000Z", cwd },
    {
      type: "message",
      id: "e1",
      parentId: null,
      timestamp: "2026-06-07T00:00:01.000Z",
      message: { role: "user", content: opts.user, timestamp: 1 },
    },
  ];
  if (opts.assistant !== undefined) {
    lines.push({
      type: "message",
      id: "e2",
      parentId: "e1",
      timestamp: "2026-06-07T00:00:02.000Z",
      message: {
        role: "assistant",
        provider: "anthropic",
        model: "claude-x",
        stopReason: "stop",
        timestamp: 2,
        content: [{ type: "text", text: opts.assistant }],
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      },
    });
  }
  if (opts.name !== undefined) {
    lines.push({
      type: "session_info",
      id: "e3",
      parentId: "e2",
      timestamp: "2026-06-07T00:00:03.000Z",
      name: opts.name,
    });
  }
  writeFileSync(file, `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`);
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "yui-catalog-"));
  sessionDir = join(home, "agent", "sessions");
  mkdirSync(sessionDir, { recursive: true });
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("PiSessionCatalog", () => {
  it("lists all sessions across cwds, sorted with a title and message count", async () => {
    writeSession(join(sessionDir, "a.jsonl"), "/proj/a", { user: "hello A", assistant: "hi A" });
    writeSession(join(sessionDir, "b.jsonl"), "/proj/b", { user: "hello B", name: "Named" });

    const catalog = new PiSessionCatalog(config("/proj/a"));
    const all = await catalog.list();

    expect(all).toHaveLength(2);
    const a = all.find((s) => s.cwd === "/proj/a");
    expect(a).toMatchObject({ title: "hello A", messageCount: 2 });
    const b = all.find((s) => s.cwd === "/proj/b");
    // A user-set session name wins over the first message as the title.
    expect(b).toMatchObject({ title: "Named", messageCount: 1 });
  });

  it("filters by cwd when one is given", async () => {
    writeSession(join(sessionDir, "a.jsonl"), "/proj/a", { user: "hello A" });
    writeSession(join(sessionDir, "b.jsonl"), "/proj/b", { user: "hello B" });

    const catalog = new PiSessionCatalog(config("/proj/a"));
    const filtered = await catalog.list({ cwd: "/proj/a" });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].cwd).toBe("/proj/a");
  });

  it("reads history as the resolved root-to-leaf message path", async () => {
    const file = join(sessionDir, "a.jsonl");
    writeSession(file, "/proj/a", { user: "hello A", assistant: "hi A" });

    const catalog = new PiSessionCatalog(config("/proj/a"));
    const history = await catalog.getHistory({ sessionPath: file });

    expect(history.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(history[0].content).toEqual([{ type: "text", text: "hello A" }]);
    expect(history[1].content).toEqual([{ type: "text", text: "hi A" }]);
    expect(history[1].completedAt).toBe(new Date("2026-06-07T00:00:02.000Z").getTime());
  });

  it("distinguishes the full transcript from the folded model-restore context", async () => {
    // A compacted session: e1 (old user) is summarized away; firstKeptEntryId
    // keeps e2 onward. Context folds e1 into a summary; transcript keeps e1.
    const file = join(sessionDir, "compacted.jsonl");
    const line = (o: unknown) => JSON.stringify(o);
    writeFileSync(
      file,
      [
        line({
          type: "session",
          version: 3,
          id: "comp1",
          timestamp: "2026-06-07T00:00:00.000Z",
          cwd: "/proj/a",
        }),
        line({
          type: "message",
          id: "e1",
          parentId: null,
          timestamp: "2026-06-07T00:00:01.000Z",
          message: { role: "user", content: "old message 1", timestamp: 1 },
        }),
        line({
          type: "message",
          id: "e2",
          parentId: "e1",
          timestamp: "2026-06-07T00:00:02.000Z",
          message: {
            role: "assistant",
            provider: "anthropic",
            model: "claude-x",
            stopReason: "stop",
            timestamp: 2,
            content: [{ type: "text", text: "old reply" }],
            usage: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 0,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
          },
        }),
        line({
          type: "compaction",
          id: "e3",
          parentId: "e2",
          timestamp: "2026-06-07T00:00:03.000Z",
          summary: "SUMMARY",
          firstKeptEntryId: "e2",
          tokensBefore: 500,
        }),
        line({
          type: "message",
          id: "e4",
          parentId: "e3",
          timestamp: "2026-06-07T00:00:04.000Z",
          message: { role: "user", content: "new message", timestamp: 4 },
        }),
      ].join("\n") + "\n",
    );

    const catalog = new PiSessionCatalog(config("/proj/a"));

    const transcript = await catalog.getHistory({ sessionPath: file });
    expect(transcript.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    // The pre-compaction message is preserved verbatim.
    expect(transcript[0].content).toEqual([{ type: "text", text: "old message 1" }]);

    const context = await catalog.getHistory({ sessionPath: file, mode: "context" });
    // Context folds the early message into a summary instead of showing it.
    expect(context.some((m) => m.role === "compactionSummary")).toBe(true);
    expect(
      context.some((m) => m.content.some((b) => b.type === "text" && b.text === "old message 1")),
    ).toBe(false);
  });

  it("reports the model and thinking level a session is configured with", async () => {
    const file = join(sessionDir, "a.jsonl");
    writeSession(file, "/proj/a", { user: "hello A", assistant: "hi A" });

    const catalog = new PiSessionCatalog(config("/proj/a"));
    const info = await catalog.getInfo({ sessionPath: file });

    expect(info).toMatchObject({
      cwd: "/proj/a",
      title: "hello A",
      messageCount: 2,
      // Derived from the assistant message's provider/model.
      model: { providerId: "anthropic", modelId: "claude-x" },
      thinkingLevel: "off",
    });
  });

  it("refuses to read (and never truncates) a non-session file", async () => {
    const file = join(sessionDir, "notes.txt");
    const original = "important notes, not a session\n";
    writeFileSync(file, original);

    const catalog = new PiSessionCatalog(config("/proj/a"));
    await expect(catalog.getHistory({ sessionPath: file })).rejects.toMatchObject({
      code: "session_path_error",
    });
    await expect(catalog.getInfo({ sessionPath: file })).rejects.toMatchObject({
      code: "session_path_error",
    });
    // The file must be left exactly as it was (regression guard for #1).
    expect(readFileSync(file, "utf8")).toBe(original);
  });

  it("throws session_path_error for a missing session file", async () => {
    const catalog = new PiSessionCatalog(config("/proj/a"));
    await expect(
      catalog.getHistory({ sessionPath: join(sessionDir, "nope.jsonl") }),
    ).rejects.toMatchObject({ code: "session_path_error" });
  });

  it("deletes a session file from disk", async () => {
    const file = join(sessionDir, "a.jsonl");
    writeSession(file, "/proj/a", { user: "hello A", assistant: "hi A" });

    const catalog = new PiSessionCatalog(config("/proj/a"));
    await catalog.delete({ sessionPath: file });

    expect(existsSync(file)).toBe(false);
    expect(await catalog.list()).toHaveLength(0);
  });

  it("refuses to delete (and never removes) a non-session file", async () => {
    const file = join(sessionDir, "notes.txt");
    const original = "important notes, not a session\n";
    writeFileSync(file, original);

    const catalog = new PiSessionCatalog(config("/proj/a"));
    await expect(catalog.delete({ sessionPath: file })).rejects.toMatchObject({
      code: "session_path_error",
    });
    expect(readFileSync(file, "utf8")).toBe(original);
  });

  it("throws session_path_error when deleting a missing session file", async () => {
    const catalog = new PiSessionCatalog(config("/proj/a"));
    await expect(
      catalog.delete({ sessionPath: join(sessionDir, "nope.jsonl") }),
    ).rejects.toMatchObject({ code: "session_path_error" });
  });

  describe("getAttachment", () => {
    const data = Buffer.from("\x89PNG fake image bytes").toString("base64");

    function writeImageSession(file: string): void {
      writeFileSync(
        file,
        [
          {
            type: "session",
            version: 3,
            id: file,
            timestamp: "2026-06-07T00:00:00.000Z",
            cwd: "/p",
          },
          {
            type: "message",
            id: "e1",
            parentId: null,
            timestamp: "2026-06-07T00:00:01.000Z",
            message: {
              role: "user",
              content: [
                { type: "text", text: "what is this?" },
                { type: "image", data, mimeType: "image/png" },
              ],
              timestamp: 1,
            },
          },
        ]
          .map((l) => JSON.stringify(l))
          .join("\n") + "\n",
      );
    }

    it("returns the image bytes and mimeType for a matching content hash", async () => {
      const file = join(sessionDir, "img.jsonl");
      writeImageSession(file);
      const catalog = new PiSessionCatalog(config("/p"));

      const att = await catalog.getAttachment(file, imageAttachmentId(data));
      expect(att?.mimeType).toBe("image/png");
      expect(Buffer.from(att!.bytes).toString("base64")).toBe(data);
    });

    it("returns undefined for an unknown id, a missing file, and a non-session file", async () => {
      const file = join(sessionDir, "img.jsonl");
      writeImageSession(file);
      const notes = join(sessionDir, "notes.txt");
      writeFileSync(notes, "not a session\n");
      const catalog = new PiSessionCatalog(config("/p"));

      expect(await catalog.getAttachment(file, "0".repeat(64))).toBeUndefined();
      expect(
        await catalog.getAttachment(join(sessionDir, "nope.jsonl"), imageAttachmentId(data)),
      ).toBeUndefined();
      // A valid-but-non-session file is rejected at the door, not scanned.
      expect(await catalog.getAttachment(notes, imageAttachmentId(data))).toBeUndefined();
    });
  });
});
