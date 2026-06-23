// Read-only access to persisted sessions. Lists JSONL session files via Pi's
// SessionManager and resolves a single file into conversation history. This is
// the cold counterpart to the live SessionPool: nothing here touches an active
// AgentSession, so a desktop UI can browse past conversations cheaply.

import { rmSync, statSync } from "node:fs";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { SessionManager, type SessionEntry } from "@earendil-works/pi-coding-agent";
import {
  type AppMessage,
  type AppSessionInfo,
  type AppSessionSummary,
  AppRuntimeError,
  type DeleteSessionInput,
  type GetHistoryInput,
  type GetSessionInfoInput,
  type ListSessionsInput,
  type RenameSessionInput,
  type RuntimeConfig,
  type SessionAttachment,
  type SessionCatalog,
  thinkingLevelSchema,
} from "@yui/contracts";
import { findAttachmentInManager } from "../agent/attachment-reader.ts";
import { mapAgentMessage } from "../agent/message-mapper.ts";
import { assertSessionFile } from "./session-file.ts";

export class PiSessionCatalog implements SessionCatalog {
  constructor(private readonly config: RuntimeConfig) {}

  async list(input: ListSessionsInput = {}): Promise<AppSessionSummary[]> {
    // Our profile uses a single flat sessionDir for every cwd (the cwd lives in
    // each session's header). Passing it as an explicit dir makes Pi filter by
    // header cwd when one is given, and list everything otherwise.
    const infos = input.cwd
      ? await SessionManager.list(input.cwd, this.config.sessionDir)
      : await SessionManager.listAll(this.config.sessionDir);

    return infos.map((info) => ({
      sessionId: info.id,
      sessionPath: info.path,
      cwd: info.cwd,
      title: info.name?.trim() || info.firstMessage,
      messageCount: info.messageCount,
      createdAt: info.created.getTime(),
      updatedAt: info.modified.getTime(),
    }));
  }

  async getInfo(input: GetSessionInfoInput): Promise<AppSessionInfo> {
    const manager = this.open(input.sessionPath);
    const header = manager.getHeader();
    const stats = statSync(input.sessionPath);

    // The resolved context reports the model + thinking level the session
    // last settled on (from model_change / assistant entries and
    // thinking_level_change), i.e. what the session is actually configured with.
    const ctx = manager.buildSessionContext();
    const messages = ctx.messages.map((m, i) => mapAgentMessage(m, `hist_${i}`));
    const firstUser = messages.find((m) => m.role === "user");
    const firstText =
      firstUser?.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("")
        .trim() ?? "";
    const name = manager.getSessionName()?.trim();
    const thinking = thinkingLevelSchema.safeParse(ctx.thinkingLevel);

    return {
      sessionId: manager.getSessionId(),
      sessionPath: input.sessionPath,
      cwd: manager.getCwd(),
      title: name || firstText || "(no messages)",
      messageCount: manager.getEntries().filter((e) => e.type === "message").length,
      createdAt: header ? new Date(header.timestamp).getTime() : stats.birthtimeMs,
      updatedAt: stats.mtimeMs,
      model: ctx.model ? { providerId: ctx.model.provider, modelId: ctx.model.modelId } : undefined,
      thinkingLevel: thinking.success ? thinking.data : "off",
    };
  }

  async getHistory(input: GetHistoryInput): Promise<AppMessage[]> {
    const manager = this.open(input.sessionPath);

    if (input.mode === "context") {
      // What the model is restored with: the root-to-leaf path with compaction
      // folded into a summary (superseded early messages are dropped).
      const { messages } = manager.buildSessionContext();
      return messages.map((message, index) => mapAgentMessage(message, `hist_${index}`));
    }

    // Default — the verbatim transcript: every message on the active branch in
    // order, including ones a compaction would have summarized away. We walk the
    // raw branch entries (no folding) and funnel each through the single mapper.
    const messages: AppMessage[] = [];
    let index = 0;
    for (const entry of manager.getBranch()) {
      const message = entryToMessage(entry);
      if (message) {
        messages.push({
          ...mapAgentMessage(message, `hist_${index++}`),
          completedAt: toEpoch(entry.timestamp),
        });
      }
    }
    return messages;
  }

  async getAttachment(
    sessionPath: string,
    attachmentId: string,
  ): Promise<SessionAttachment | undefined> {
    // Tolerant by design: this backs an <img> loader, so a bad path or unknown
    // id is a miss (→ 404), not an error. Only valid session files are opened
    // (assertSessionFile), and we return bytes solely for an image whose content
    // hash matches the requested id — so this cannot exfiltrate arbitrary files.
    try {
      return findAttachmentInManager(this.open(sessionPath), attachmentId);
    } catch {
      return undefined;
    }
  }

  async delete(input: DeleteSessionInput): Promise<void> {
    // Refuse to unlink anything that isn't a real session file: the same guard
    // that stops Pi from truncating an unrelated path also stops us deleting one.
    assertSessionFile(input.sessionPath);
    try {
      rmSync(input.sessionPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new AppRuntimeError("internal", `Failed to delete session: ${message}`, error);
    }
  }

  async rename(input: RenameSessionInput): Promise<void> {
    // The display name is an append-only `session_info` entry; the latest one
    // wins. Cold-opening persists (open() uses persist=true), so this works for
    // sessions that aren't live in the pool. `appendSessionInfo` trims for us.
    const manager = this.open(input.sessionPath);
    try {
      manager.appendSessionInfo(input.title);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new AppRuntimeError("internal", `Failed to rename session: ${message}`, error);
    }
  }

  private open(sessionPath: string): SessionManager {
    // Reject non-session files before open() can truncate them (see session-file.ts).
    assertSessionFile(sessionPath);
    try {
      return SessionManager.open(sessionPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new AppRuntimeError("session_path_error", `Cannot read session: ${message}`, error);
    }
  }
}

/**
 * Reconstruct the conversation message a branch entry represents, or `undefined`
 * for non-message entries. Synthesizes the same message shapes `mapAgentMessage`
 * understands, so all entry kinds flow through that single mapping seam. Used by
 * the transcript path; `compaction` entries are intentionally skipped (the real
 * messages they summarize are already on the branch).
 */
function entryToMessage(entry: SessionEntry): AgentMessage | undefined {
  switch (entry.type) {
    case "message":
      return entry.message;
    case "custom_message":
      return {
        role: "custom",
        customType: entry.customType,
        content: entry.content,
        display: entry.display,
        timestamp: toEpoch(entry.timestamp),
      };
    case "branch_summary":
      return entry.summary
        ? {
            role: "branchSummary",
            summary: entry.summary,
            fromId: entry.fromId,
            timestamp: toEpoch(entry.timestamp),
          }
        : undefined;
    default:
      // compaction / model_change / thinking_level_change / custom / label /
      // session_info are not conversation messages.
      return undefined;
  }
}

function toEpoch(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? Date.now() : t;
}
