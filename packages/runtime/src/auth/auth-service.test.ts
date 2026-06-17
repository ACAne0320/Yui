import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { registerOAuthProvider, unregisterOAuthProvider } from "@earendil-works/pi-ai/oauth";
import { describe, expect, it, vi } from "vitest";
import { PiAuthService } from "./auth-service.ts";

function makeService() {
  const authStorage = AuthStorage.inMemory();
  const modelRegistry = ModelRegistry.inMemory(authStorage);
  return { authStorage, service: new PiAuthService(authStorage, modelRegistry) };
}

describe("PiAuthService", () => {
  it("sets, lists, and removes an api key", async () => {
    const { authStorage, service } = makeService();

    await service.setApiKey({ providerId: "anthropic", apiKey: "sk-secret" });
    expect(authStorage.list()).toContain("anthropic");

    await service.removeApiKey({ providerId: "anthropic" });
    expect(authStorage.list()).not.toContain("anthropic");
  });

  it("reports provider status as usable and echoes the stored key after a key is set", async () => {
    const { service } = makeService();
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
  });

  it("distinguishes subscription-only providers from API-key providers", async () => {
    const { service } = makeService();

    const providers = await service.listProviders();

    expect(providers.find((p) => p.providerId === "openai-codex")?.authMethods).toEqual(["oauth"]);
    expect(providers.find((p) => p.providerId === "deepseek")?.authMethods).toEqual(["api_key"]);
    expect(providers.find((p) => p.providerId === "anthropic")?.authMethods).toEqual([
      "oauth",
      "api_key",
    ]);
  });

  it("reports stored OAuth credentials without exposing their tokens", async () => {
    const authStorage = AuthStorage.inMemory({
      anthropic: {
        type: "oauth",
        access: "secret-access",
        refresh: "secret-refresh",
        expires: Date.now() + 60_000,
      },
    });
    const service = new PiAuthService(authStorage, ModelRegistry.inMemory(authStorage));

    const anthropic = (await service.listProviders()).find((p) => p.providerId === "anthropic");

    expect(anthropic?.configured).toBe(true);
    expect(anthropic?.credentialType).toBe("oauth");
    expect(anthropic?.apiKey).toBeUndefined();
  });

  it("marks a provider unconfigured when it has no credential", async () => {
    const { service } = makeService();
    const providers = await service.listProviders();
    const anthropic = providers.find((p) => p.providerId === "anthropic");
    expect(anthropic?.configured).toBe(false);
    expect(anthropic?.availableModelCount).toBe(0);
  });

  it("throws instead of reporting success when the credential cannot be persisted", async () => {
    // authPath's parent is a regular file, so Pi's AuthStorage cannot create or
    // write it; it records the error internally instead of throwing.
    const dir = mkdtempSync(join(tmpdir(), "yui-auth-fail-"));
    const fileAsParent = join(dir, "not-a-dir");
    writeFileSync(fileAsParent, "x");
    const authStorage = AuthStorage.create(join(fileAsParent, "auth.json"));
    const service = new PiAuthService(authStorage, ModelRegistry.inMemory(authStorage));

    await expect(service.setApiKey({ providerId: "anthropic", apiKey: "x" })).rejects.toMatchObject(
      { code: "internal" },
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("bridges an OAuth provider login through serializable prompts", async () => {
    const providerId = `test-oauth-${Date.now()}`;
    registerOAuthProvider({
      id: providerId,
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
    });

    try {
      const authStorage = AuthStorage.inMemory();
      const service = new PiAuthService(authStorage, ModelRegistry.inMemory(authStorage));
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
      expect(authStorage.get(providerId)).toMatchObject({
        type: "oauth",
        access: "access-browser-done",
      });
    } finally {
      unregisterOAuthProvider(providerId);
    }
  });

  it("cancels an in-flight OAuth login and settles its pending prompt", async () => {
    const providerId = `test-oauth-cancel-${Date.now()}`;
    registerOAuthProvider({
      id: providerId,
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
    });

    try {
      const authStorage = AuthStorage.inMemory();
      const service = new PiAuthService(authStorage, ModelRegistry.inMemory(authStorage));
      const started = await service.beginOAuthLogin({ providerId });

      service.cancelOAuthLogin({ flowId: started.flowId });

      expect(service.getOAuthLoginState({ flowId: started.flowId })).toMatchObject({
        status: "cancelled",
        prompt: undefined,
      });
      expect(authStorage.get(providerId)).toBeUndefined();
    } finally {
      unregisterOAuthProvider(providerId);
    }
  });
});
