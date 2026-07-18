// Tests for the context-inspection and manual-compaction surface:
// getContextUsage / getContextSnapshot reads and compact()'s guard rails.
// The compaction happy path itself delegates to Pi's session.compact()
// (covered upstream) and needs a live model, so it is not exercised here.

import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeConfig } from "@yui/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { createInfrastructure } from "../pi/infrastructure.ts";
import { PiAgentService } from "./agent-service.ts";

describe("PiAgentService context APIs", () => {
  let dir: string;
  let service: PiAgentService | undefined;

  afterEach(async () => {
    await service?.dispose();
    service = undefined;
    rmSync(dir, { recursive: true, force: true });
  });

  async function setup(): Promise<{ config: RuntimeConfig; service: PiAgentService }> {
    dir = mkdtempSync(join(tmpdir(), "yui-ctx-"));
    const agentDir = join(dir, "agent");
    const sessionDir = join(dir, "sessions");
    const cwd = join(dir, "project");
    mkdirSync(agentDir, { recursive: true });
    mkdirSync(sessionDir, { recursive: true });
    mkdirSync(cwd, { recursive: true });

    const config: RuntimeConfig = { homeDir: dir, agentDir, sessionDir, cwd };
    service = new PiAgentService(
      await createInfrastructure(config, { allowModelNetwork: false }),
      config,
    );
    return { config, service };
  }

  it("reads context usage from a live session", async () => {
    const { config, service: agentService } = await setup();
    const opened = await agentService.openSession({ cwd: config.cwd });

    // No model is configured offline, so usage is unknown — the read must not
    // throw either way.
    const usage = await agentService.getContextUsage(opened.sessionId);
    expect(usage === undefined || typeof usage.contextWindow === "number").toBe(true);
  });

  it("rejects context reads and compaction for unknown sessions", async () => {
    const { service: agentService } = await setup();

    await expect(agentService.getContextUsage("nope")).rejects.toThrow();
    await expect(agentService.compact({ sessionId: "nope" })).rejects.toThrow();
  });
});
