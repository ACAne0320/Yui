import { randomUUID } from "node:crypto";
import type { AuthPrompt } from "@earendil-works/pi-ai";
import {
  type ModelRegistry,
  type ModelRuntime,
  readStoredCredential,
} from "@earendil-works/pi-coding-agent";
import {
  AppRuntimeError,
  type AuthMethod,
  type AuthService,
  type BeginOAuthLoginInput,
  type OAuthLoginFlowInput,
  type OAuthLoginPrompt,
  type OAuthLoginState,
  type ProviderStatus,
  type RemoveApiKeyInput,
  type RespondToOAuthLoginInput,
  type SetApiKeyInput,
} from "@yui/contracts";

interface OAuthFlow {
  state: OAuthLoginState;
  controller: AbortController;
  pending?: {
    requestId: string;
    resolve(value: string): void;
    reject(error: Error): void;
  };
}

export class PiAuthService implements AuthService {
  private readonly oauthFlows = new Map<string, OAuthFlow>();

  constructor(
    private readonly modelRuntime: ModelRuntime,
    private readonly modelRegistry: ModelRegistry,
    private readonly authPath: string,
  ) {}

  async setApiKey(input: SetApiKeyInput): Promise<void> {
    // Route through the provider's own api-key login so the credential is
    // persisted by Pi's credential store (Pi 0.80 no longer exposes a direct
    // auth.json writer). Yui's settings UI collects a single key, so answer
    // the first secret prompt with it; providers whose setup needs more
    // fields (e.g. Cloudflare's account/gateway IDs) fail loudly here instead
    // of silently storing a credential that cannot resolve.
    let answered = false;
    try {
      await this.modelRuntime.login(input.providerId, "api_key", {
        prompt: (prompt) => {
          if (answered || prompt.type === "select") {
            return Promise.reject(
              new Error(
                `Provider "${input.providerId}" requires more than a plain API key to log in.`,
              ),
            );
          }
          answered = true;
          return Promise.resolve(input.apiKey);
        },
        notify: () => {},
      });
    } catch (error) {
      throw toAppError("store credentials", error);
    }
  }

  async removeApiKey(input: RemoveApiKeyInput): Promise<void> {
    try {
      await this.modelRuntime.logout(input.providerId);
    } catch (error) {
      throw toAppError("remove credentials", error);
    }
  }

  async listProviders(): Promise<ProviderStatus[]> {
    const availableCounts = new Map<string, number>();
    for (const model of this.modelRegistry.getAvailable()) {
      availableCounts.set(model.provider, (availableCounts.get(model.provider) ?? 0) + 1);
    }

    // Providers Yui knows about: those with models in the registry, plus any
    // that have a stored credential.
    const providerIds = new Set<string>();
    for (const model of this.modelRegistry.getAll()) providerIds.add(model.provider);
    for (const credential of await this.modelRuntime.listCredentials()) {
      providerIds.add(credential.providerId);
    }

    return [...providerIds].toSorted().map((providerId) => {
      // Use the registry's status rather than the credential store alone: it
      // also accounts for a provider's inline `models.json` key, so
      // `configured` stays consistent with `getAvailable()` (which counts
      // those models) instead of reporting a provider as unconfigured while
      // it has available models.
      const status = this.modelRegistry.getProviderAuthStatus(providerId);
      // Echo back only locally stored api-key credentials so the settings UI
      // can pre-fill and edit them; OAuth/env-sourced secrets are left out.
      const credential = readStoredCredential(providerId, this.authPath);
      const apiKey = credential?.type === "api_key" ? credential.key : undefined;
      return {
        providerId,
        displayName: this.modelRegistry.getProviderDisplayName(providerId),
        configured: status.configured,
        authMethods: getAuthMethods(
          providerId,
          this.modelRuntime.getProvider(providerId)?.auth?.oauth !== undefined,
        ),
        credentialType: credential?.type,
        authSource: status.source,
        apiKey,
        availableModelCount: availableCounts.get(providerId) ?? 0,
      };
    });
  }

  async beginOAuthLogin(input: BeginOAuthLoginInput): Promise<OAuthLoginState> {
    const provider = this.modelRuntime.getProvider(input.providerId);
    const oauth = provider?.auth?.oauth;
    if (!provider || !oauth) {
      throw new AppRuntimeError(
        "invalid_input",
        `Provider "${input.providerId}" does not support subscription login.`,
      );
    }

    const flow: OAuthFlow = {
      state: {
        flowId: randomUUID(),
        providerId: provider.id,
        providerName: oauth.name || provider.name,
        status: "running",
      },
      controller: new AbortController(),
    };
    this.oauthFlows.set(flow.state.flowId, flow);
    void this.runOAuthLogin(flow);
    await Promise.resolve();
    return cloneOAuthState(flow.state);
  }

  getOAuthLoginState(input: OAuthLoginFlowInput): OAuthLoginState {
    return cloneOAuthState(this.requireOAuthFlow(input.flowId).state);
  }

  respondToOAuthLogin(input: RespondToOAuthLoginInput): void {
    const flow = this.requireOAuthFlow(input.flowId);
    const pending = flow.pending;
    if (!pending || pending.requestId !== input.requestId) return;

    flow.pending = undefined;
    flow.state = { ...flow.state, prompt: undefined };
    if (input.response.kind === "cancelled") {
      pending.reject(new Error("Login cancelled"));
    } else {
      pending.resolve(input.response.value);
    }
  }

  cancelOAuthLogin(input: OAuthLoginFlowInput): void {
    const flow = this.requireOAuthFlow(input.flowId);
    if (flow.state.status !== "running") return;

    flow.controller.abort();
    flow.pending?.reject(new Error("Login cancelled"));
    flow.pending = undefined;
    flow.state = {
      ...flow.state,
      status: "cancelled",
      prompt: undefined,
      message: "Login cancelled",
    };
  }

  dispose(): void {
    for (const flow of this.oauthFlows.values()) {
      if (flow.state.status === "running") this.cancelOAuthLogin({ flowId: flow.state.flowId });
    }
    this.oauthFlows.clear();
  }

  private async runOAuthLogin(flow: OAuthFlow): Promise<void> {
    try {
      await this.modelRuntime.login(flow.state.providerId, "oauth", {
        signal: flow.controller.signal,
        notify: (event) => {
          switch (event.type) {
            case "auth_url":
              flow.state = {
                ...flow.state,
                authUrl: event.url,
                instructions: event.instructions,
                message: "Complete login in your browser.",
              };
              break;
            case "device_code":
              flow.state = {
                ...flow.state,
                deviceCode: {
                  userCode: event.userCode,
                  verificationUri: event.verificationUri,
                  expiresInSeconds: event.expiresInSeconds,
                },
                message: "Enter the device code in your browser.",
              };
              break;
            case "info":
            case "progress":
              flow.state = { ...flow.state, message: event.message };
              break;
          }
        },
        prompt: (prompt) => this.requestOAuthInput(flow, toOAuthLoginPrompt(prompt)),
      });

      if (flow.state.status !== "running") return;
      // ModelRuntime.login already persisted the credential through the
      // credential store (store failures reject) and refreshed the model
      // catalog, so nothing else is needed here.
      flow.pending = undefined;
      flow.state = {
        ...flow.state,
        status: "succeeded",
        prompt: undefined,
        message: "Subscription connected.",
      };
    } catch (error) {
      if (flow.state.status === "cancelled") return;
      flow.pending = undefined;
      flow.state = {
        ...flow.state,
        status: "failed",
        prompt: undefined,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private requestOAuthInput(
    flow: OAuthFlow,
    prompt: Omit<OAuthLoginPrompt, "requestId">,
  ): Promise<string> {
    if (flow.controller.signal.aborted) return Promise.reject(new Error("Login cancelled"));
    flow.pending?.reject(new Error("OAuth login request superseded"));

    const requestId = randomUUID();
    flow.state = { ...flow.state, prompt: { ...prompt, requestId } };
    return new Promise<string>((resolve, reject) => {
      flow.pending = { requestId, resolve, reject };
    });
  }

  private requireOAuthFlow(flowId: string): OAuthFlow {
    const flow = this.oauthFlows.get(flowId);
    if (!flow) throw new AppRuntimeError("invalid_input", `Unknown OAuth login flow: ${flowId}`);
    return flow;
  }
}

const OAUTH_ONLY_PROVIDERS = new Set(["github-copilot", "openai-codex"]);

function getAuthMethods(providerId: string, supportsOAuth: boolean): AuthMethod[] {
  if (OAUTH_ONLY_PROVIDERS.has(providerId)) return ["oauth"];
  if (supportsOAuth) return ["oauth", "api_key"];
  return ["api_key"];
}

/** Map a Pi login prompt onto Yui's three OAuth prompt kinds. */
function toOAuthLoginPrompt(prompt: AuthPrompt): Omit<OAuthLoginPrompt, "requestId"> {
  switch (prompt.type) {
    case "select":
      return {
        kind: "select",
        message: prompt.message,
        options: prompt.options.map((option) => ({ id: option.id, label: option.label })),
      };
    case "manual_code":
      return {
        kind: "manual_code",
        message: prompt.message || "Paste the authorization code or full redirect URL.",
        placeholder: prompt.placeholder,
      };
    default:
      return { kind: "input", message: prompt.message, placeholder: prompt.placeholder };
  }
}

function toAppError(action: string, error: unknown): AppRuntimeError {
  return new AppRuntimeError(
    "internal",
    `Failed to ${action}: ${error instanceof Error ? error.message : String(error)}`,
    error,
  );
}

function cloneOAuthState(state: OAuthLoginState): OAuthLoginState {
  return structuredClone(state);
}
