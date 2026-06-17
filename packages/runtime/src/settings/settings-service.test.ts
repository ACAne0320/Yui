import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { RuntimeConfig } from "@yui/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PiSettingsService } from "./settings-service.ts";

let home: string;
let cwd: string;

// Only `find` is exercised; a stub keeps the test off the real model catalog.
const registry = {
  find: (provider: string, modelId: string) =>
    provider === "anthropic" && modelId === "claude-x" ? ({} as unknown) : undefined,
} as unknown as ModelRegistry;

function config(): RuntimeConfig {
  const agentDir = join(home, "agent");
  return { homeDir: home, agentDir, sessionDir: join(agentDir, "sessions"), cwd };
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "yui-settings-"));
  cwd = join(home, "proj");
  mkdirSync(join(home, "agent"), { recursive: true });
  mkdirSync(cwd, { recursive: true });
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("PiSettingsService", () => {
  it("returns unset defaults for a fresh profile", async () => {
    const svc = new PiSettingsService(config(), registry);
    expect(await svc.getDefaults()).toEqual({
      providerId: undefined,
      modelId: undefined,
      thinkingLevel: undefined,
    });
  });

  it("persists a default model that a new instance reads back", async () => {
    const cfg = config();
    await new PiSettingsService(cfg, registry).setDefaultModel({
      providerId: "anthropic",
      modelId: "claude-x",
    });

    // A fresh instance reads from disk, proving it was persisted (global settings.json).
    const reloaded = await new PiSettingsService(cfg, registry).getDefaults();
    expect(reloaded).toMatchObject({ providerId: "anthropic", modelId: "claude-x" });
  });

  it("persists a default thinking level", async () => {
    const cfg = config();
    await new PiSettingsService(cfg, registry).setDefaultThinkingLevel({ thinkingLevel: "high" });
    const reloaded = await new PiSettingsService(cfg, registry).getDefaults();
    expect(reloaded.thinkingLevel).toBe("high");
  });

  it("rejects a model that the registry does not know", async () => {
    const svc = new PiSettingsService(config(), registry);
    await expect(
      svc.setDefaultModel({ providerId: "anthropic", modelId: "nope" }),
    ).rejects.toMatchObject({ code: "unknown_model" });
  });

  it("throws instead of reporting success when settings cannot be written", async () => {
    // agentDir is a regular file, so global settings.json is unreadable/unwritable;
    // Pi records the error rather than throwing, so the service must surface it.
    const notADir = join(home, "agent-as-file");
    writeFileSync(notADir, "x");
    const cfg: RuntimeConfig = {
      homeDir: home,
      agentDir: notADir,
      sessionDir: join(notADir, "sessions"),
      cwd,
    };
    const svc = new PiSettingsService(cfg, registry);
    await expect(svc.setDefaultThinkingLevel({ thinkingLevel: "high" })).rejects.toMatchObject({
      code: "internal",
    });
  });
});
