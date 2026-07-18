// Integration test: a fixture extension placed in <agentDir>/extensions/ is
// discovered by Pi, bound by openSession with the ExtensionUiBridge, and its
// UI interactions round-trip through the AgentService surface.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeConfig } from "@yui/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInfrastructure } from "../pi/infrastructure.ts";
import { PiAgentService } from "./agent-service.ts";

const FIXTURE_EXTENSION = `
export default function fixtureExtension(pi) {
  pi.registerTool({
    name: "fixture_echo",
    label: "Fixture Echo",
    description: "Echoes back its input",
    parameters: { type: "object", properties: { text: { type: "string" } } },
    async execute() {
      return { content: [{ type: "text", text: "ok" }] };
    },
  });
  pi.registerCommand("fixture", {
    description: "Fixture command",
    handler: async () => {},
  });
  pi.on("session_start", (_event, ctx) => {
    globalThis.yuiFixtureHasUI = ctx.hasUI;
    ctx.ui.setStatus("fixture", "ready");
    void ctx.ui.confirm("Fixture gate", "Allow the tool?").then((ok) => {
      globalThis.yuiFixtureConfirm = ok;
    });
  });
}
`;

// session_start awaits a gate the test controls, simulating an extension that
// blocks on the network at startup.
const BLOCKING_EXTENSION = `
export default function blockingExtension(pi) {
  pi.on("session_start", async (_event, ctx) => {
    await globalThis.yuiBlockGate;
    ctx.ui.setStatus("blocked", "released");
  });
}
`;

const flags = globalThis as Record<string, unknown>;

describe("PiAgentService extension binding", () => {
  let dir: string;
  let service: PiAgentService | undefined;

  afterEach(async () => {
    await service?.dispose();
    service = undefined;
    rmSync(dir, { recursive: true, force: true });
    delete flags.yuiFixtureConfirm;
    delete flags.yuiFixtureHasUI;
    delete flags.yuiBlockGate;
  });

  async function setup(): Promise<{ config: RuntimeConfig; service: PiAgentService }> {
    dir = mkdtempSync(join(tmpdir(), "yui-ext-"));
    const agentDir = join(dir, "agent");
    const sessionDir = join(dir, "sessions");
    const cwd = join(dir, "project");
    mkdirSync(join(agentDir, "extensions"), { recursive: true });
    mkdirSync(sessionDir, { recursive: true });
    mkdirSync(cwd, { recursive: true });
    writeFileSync(join(agentDir, "extensions", "fixture.js"), FIXTURE_EXTENSION);

    const config: RuntimeConfig = { homeDir: dir, agentDir, sessionDir, cwd };
    service = new PiAgentService(
      await createInfrastructure(config, { allowModelNetwork: false }),
      config,
    );
    return { config, service };
  }

  it("binds the fixture extension: session_start ran, UI is live, and a confirm round-trips", async () => {
    const { config, service: agentService } = await setup();
    const opened = await agentService.openSession({ cwd: config.cwd });
    const sessionId = opened.sessionId;

    // session_start is delivered in the background after openSession returns (so
    // a slow startup handler can't block the session opening), so wait for its
    // effects rather than asserting synchronously.
    await vi.waitFor(() => expect(flags.yuiFixtureHasUI).toBe(true));

    // The extension and its registrations are visible through the service.
    const info = agentService.getExtensions(sessionId);
    expect(info.errors).toEqual([]);
    expect(info.extensions).toHaveLength(1);
    expect(info.extensions[0].tools).toEqual([
      { name: "fixture_echo", description: "Echoes back its input" },
    ]);
    expect(info.extensions[0].commands).toEqual([
      { name: "fixture", description: "Fixture command" },
    ]);

    // The snapshot restores the status chip and the pending confirm dialog.
    const snapshot = agentService.getExtensionUiState(sessionId);
    expect(snapshot.statuses).toEqual([{ key: "fixture", text: "ready" }]);
    expect(snapshot.pendingRequests).toHaveLength(1);
    const pending = snapshot.pendingRequests[0];
    expect(pending).toMatchObject({ kind: "confirm", title: "Fixture gate" });

    // Answering through the service resolves the extension's promise.
    await agentService.respondToExtensionUi({
      sessionId,
      requestId: pending.requestId,
      response: { kind: "confirmed", confirmed: true },
    });
    await vi.waitFor(() => expect(flags.yuiFixtureConfirm).toBe(true));
    expect(agentService.getExtensionUiState(sessionId).pendingRequests).toHaveLength(0);
  });

  it("rejects the pending dialog with the default when the session closes", async () => {
    const { config, service: agentService } = await setup();
    const opened = await agentService.openSession({ cwd: config.cwd });

    await vi.waitFor(() =>
      expect(agentService.getExtensionUiState(opened.sessionId).pendingRequests).toHaveLength(1),
    );
    await agentService.closeSession(opened.sessionId);
    await vi.waitFor(() => expect(flags.yuiFixtureConfirm).toBe(false));
  });

  it("does not block the session open on a slow session_start handler", async () => {
    const { config, service: agentService } = await setup();
    let release!: () => void;
    flags.yuiBlockGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    writeFileSync(join(config.agentDir, "extensions", "blocking.js"), BLOCKING_EXTENSION);

    // If openSession awaited session_start this would deadlock: the gate is only
    // released after the open has already resolved.
    const opened = await agentService.openSession({ cwd: config.cwd });
    expect(agentService.getExtensionUiState(opened.sessionId).statuses).not.toContainEqual({
      key: "blocked",
      text: "released",
    });

    release();
    await vi.waitFor(() =>
      expect(agentService.getExtensionUiState(opened.sessionId).statuses).toContainEqual({
        key: "blocked",
        text: "released",
      }),
    );
  });

  it("surfaces extension load errors through getExtensions", async () => {
    const { config, service: agentService } = await setup();
    writeFileSync(
      join(config.agentDir, "extensions", "broken.js"),
      "export default function broken() { throw new Error('boom at load'); }",
    );

    const opened = await agentService.openSession({ cwd: config.cwd });
    const info = agentService.getExtensions(opened.sessionId);
    expect(info.errors).toHaveLength(1);
    expect(info.errors[0].error).toContain("boom at load");
    // The healthy fixture still loaded alongside the broken one.
    expect(info.extensions.map((e) => e.tools.map((t) => t.name)).flat()).toContain("fixture_echo");
  });
});
