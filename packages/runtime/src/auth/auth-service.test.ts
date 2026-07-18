import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Credential } from "@earendil-works/pi-ai";
import { ModelRegistry, ModelRuntime, readStoredCredential } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { PiAuthService } from "./auth-service.ts";

async function makeService(options: { seedCredentials?: Record<string, Credential> } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "yui-auth-test-"));
  const authPath = join(dir, "auth.json");
  if (options.seedCredentials) {
    writeFileSync(authPath, JSON.stringify(options.seedCredentials), { mode: 0o600 });
  }
  // Offline, file-backed runtime: no network catalog refresh, no models.json.
  const modelRuntime = await ModelRuntime.create({
    authPath,
    modelsPath: null,
    allowModelNetwork: false,
  });
  const service = new PiAuthService(modelRuntime, new ModelRegistry(modelRuntime), authPath);
  return { dir, authPath, modelRuntime, service };
}

describe("PiAuthService", () => {
  it("sets, lists, and removes an api key", async () => {
    const { dir, authPath, service } = await makeService();
    try {
      await service.setApiKey({ providerId: "anthropic", apiKey: "sk-secret" });
      expect(readStoredCredential("anthropic", authPath)).toMatchObject({
        type: "api_key",
        key: "sk-secret",
      });

      await service.removeApiKey({ providerId: "anthropic" });
      expect(readStoredCredential("anthropic", authPath)).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports provider status as usable and echoes the stored key after a key is set", async () => {
    const { dir, service } = await makeService();
    try {
      await service.setApiKey({ providerId: "anthropic", apiKey: "sk-secret" });

      const providers = await service.listProviders();
      const anthropic = providers.find((p) => p.providerId === "anthropic");

      expect(anthropic).toBeDefined();
      expect(anthropic?.configured).toBe(true);
      expect(anthropic?.authMethods).toEqual(["oauth", "api_key"]);
      expect(anthropic?.credentialType).toBe("api_key");
      expect(anthropic?.availableModelCount).toBeGreaterThan(0);
      // The locally stored api key is echoed back so the settings UI can reveal
      // and edit it (single-user desktop app).
      expect(anthropic?.apiKey).toBe("sk-secret");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("distinguishes subscription-only providers from API-key providers", async () => {
    const { dir, service } = await makeService();
    try {
      const providers = await service.listProviders();

      expect(providers.find((p) => p.providerId === "openai-codex")?.authMethods).toEqual([
        "oauth",
      ]);
      expect(providers.find((p) => p.providerId === "deepseek")?.authMethods).toEqual(["api_key"]);
      expect(providers.find((p) => p.providerId === "anthropic")?.authMethods).toEqual([
        "oauth",
        "api_key",
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports stored OAuth credentials without exposing their tokens", async () => {
    const { dir, service } = await makeService({
      seedCredentials: {
        anthropic: {
          type: "oauth",
          access: "secret-access",
          refresh: "secret-refresh",
          expires: Date.now() + 60_000,
        },
      },
    });
    try {
      const anthropic = (await service.listProviders()).find((p) => p.providerId === "anthropic");

      expect(anthropic?.configured).toBe(true);
      expect(anthropic?.credentialType).toBe("oauth");
      expect(anthropic?.apiKey).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("marks a provider unconfigured when it has no credential", async () => {
    const { dir, service } = await makeService();
    try {
      const providers = await service.listProviders();
      const anthropic = providers.find((p) => p.providerId === "anthropic");
      expect(anthropic?.configured).toBe(false);
      expect(anthropic?.availableModelCount).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws instead of reporting success when the credential cannot be persisted", async () => {
    // authPath's parent is a regular file, so the credential store cannot
    // create or write auth.json; the write must reject (Pi 0.80 stores reject
    // on storage failure instead of recording errors internally).
    const dir = mkdtempSync(join(tmpdir(), "yui-auth-fail-"));
    const fileAsParent = join(dir, "not-a-dir");
    writeFileSync(fileAsParent, "x");
    const modelRuntime = await ModelRuntime.create({
      authPath: join(fileAsParent, "auth.json"),
      modelsPath: null,
      allowModelNetwork: false,
    });
    const service = new PiAuthService(
      modelRuntime,
      new ModelRegistry(modelRuntime),
      join(fileAsParent, "auth.json"),
    );

    await expect(service.setApiKey({ providerId: "anthropic", apiKey: "x" })).rejects.toMatchObject(
      { code: "internal" },
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("bridges an OAuth provider login through serializable prompts", async () => {
    const { dir, authPath, modelRuntime, service } = await makeService();
    const providerId = `test-oauth-${Date.now()}`;
    modelRuntime.registerProvider(providerId, {
      name: "Test Subscription",
      baseUrl: "https://example.test",
      api: "openai-completions",
      oauth: {
        name: "Test Subscription",
        async login(callbacks) {
          const method = await callbacks.onSelect({
            message: "Choose login method",
            options: [{ id: "browser", label: "Browser" }],
          });
          callbacks.onAuth({ url: "https://example.test/login", instructions: "Sign in" });
          const code = await callbacks.onPrompt({ message: "Paste code" });
          return {
            access: `access-${method}-${code}`,
            refresh: "refresh-token",
            expires: Date.now() + 60_000,
          };
        },
        async refreshToken(credentials) {
          return credentials;
        },
        getApiKey(credentials) {
          return credentials.access;
        },
      },
      models: [
        {
          id: "test-model",
          name: "Test Model",
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 8192,
          maxTokens: 1024,
        },
      ],
    });

    try {
      const started = await service.beginOAuthLogin({ providerId });

      expect(started.prompt).toMatchObject({ kind: "select", message: "Choose login method" });
      service.respondToOAuthLogin({
        flowId: started.flowId,
        requestId: started.prompt!.requestId,
        response: { kind: "value", value: "browser" },
      });

      await vi.waitFor(() => {
        expect(service.getOAuthLoginState({ flowId: started.flowId }).prompt).toMatchObject({
          kind: "input",
          message: "Paste code",
        });
      });
      const prompt = service.getOAuthLoginState({ flowId: started.flowId }).prompt!;
      service.respondToOAuthLogin({
        flowId: started.flowId,
        requestId: prompt.requestId,
        response: { kind: "value", value: "done" },
      });

      await vi.waitFor(() => {
        expect(service.getOAuthLoginState({ flowId: started.flowId }).status).toBe("succeeded");
      });
      expect(readStoredCredential(providerId, authPath)).toMatchObject({
        type: "oauth",
        access: "access-browser-done",
      });
    } finally {
      modelRuntime.unregisterProvider(providerId);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("cancels an in-flight OAuth login and settles its pending prompt", async () => {
    const { dir, authPath, modelRuntime, service } = await makeService();
    const providerId = `test-oauth-cancel-${Date.now()}`;
    modelRuntime.registerProvider(providerId, {
      name: "Cancellable Subscription",
      baseUrl: "https://example.test",
      api: "openai-completions",
      oauth: {
        name: "Cancellable Subscription",
        async login(callbacks) {
          await callbacks.onPrompt({ message: "Wait for code" });
          throw new Error("Login should have been cancelled");
        },
        async refreshToken(credentials) {
          return credentials;
        },
        getApiKey(credentials) {
          return credentials.access;
        },
      },
      models: [
        {
          id: "test-model",
          name: "Test Model",
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 8192,
          maxTokens: 1024,
        },
      ],
    });

    try {
      const started = await service.beginOAuthLogin({ providerId });

      service.cancelOAuthLogin({ flowId: started.flowId });

      expect(service.getOAuthLoginState({ flowId: started.flowId })).toMatchObject({
        status: "cancelled",
        prompt: undefined,
      });
      expect(readStoredCredential(providerId, authPath)).toBeUndefined();
    } finally {
      modelRuntime.unregisterProvider(providerId);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
