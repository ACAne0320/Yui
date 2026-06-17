import { randomUUID } from "node:crypto";
import type { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
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
    private readonly authStorage: AuthStorage,
    private readonly modelRegistry: ModelRegistry,
  ) {}

  async setApiKey(input: SetApiKeyInput): Promise<void> {
    // `getAvailable()` re-checks auth live, so no registry refresh is needed
    // for a plain api-key change.
    this.authStorage.set(input.providerId, { type: "api_key", key: input.apiKey });
    this.assertPersisted("store credentials");
  }

  async removeApiKey(input: RemoveApiKeyInput): Promise<void> {
    this.authStorage.remove(input.providerId);
    this.assertPersisted("remove credentials");
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
    for (const providerId of this.authStorage.list()) providerIds.add(providerId);

    return [...providerIds].toSorted().map((providerId) => {
      // Use the registry's status rather than AuthStorage alone: it also accounts
      // for a provider's inline `models.json` key, so `configured` stays
      // consistent with `getAvailable()` (which counts those models) instead of
      // reporting a provider as unconfigured while it has available models.
      const status = this.modelRegistry.getProviderAuthStatus(providerId);
      // Echo back only locally stored api-key credentials so the settings UI
      // can pre-fill and edit them; OAuth/env-sourced secrets are left out.
      const credential = this.authStorage.get(providerId);
      const apiKey = credential?.type === "api_key" ? credential.key : undefined;
      return {
        providerId,
        displayName: this.modelRegistry.getProviderDisplayName(providerId),
        configured: status.configured,
        authMethods: getAuthMethods(
          providerId,
          this.authStorage.getOAuthProviders().some((p) => p.id === providerId),
        ),
        credentialType: credential?.type,
        authSource: status.source,
        apiKey,
        availableModelCount: availableCounts.get(providerId) ?? 0,
      };
    });
  }

  async beginOAuthLogin(input: BeginOAuthLoginInput): Promise<OAuthLoginState> {
    const provider = this.authStorage
      .getOAuthProviders()
      .find((item) => item.id === input.providerId);
    if (!provider) {
      throw new AppRuntimeError(
        "invalid_input",
        `Provider "${input.providerId}" does not support subscription login.`,
      );
    }

    const flow: OAuthFlow = {
      state: {
        flowId: randomUUID(),
        providerId: provider.id,
        providerName: provider.name,
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
      await this.authStorage.login(flow.state.providerId, {
        onAuth: (info) => {
          flow.state = {
            ...flow.state,
            authUrl: info.url,
            instructions: info.instructions,
            message: "Complete login in your browser.",
          };
        },
        onDeviceCode: (info) => {
          flow.state = {
            ...flow.state,
            deviceCode: {
              userCode: info.userCode,
              verificationUri: info.verificationUri,
              expiresInSeconds: info.expiresInSeconds,
            },
            message: "Enter the device code in your browser.",
          };
        },
        onPrompt: (prompt) =>
          this.requestOAuthInput(flow, {
            kind: "input",
            message: prompt.message,
            placeholder: prompt.placeholder,
          }),
        onProgress: (message) => {
          flow.state = { ...flow.state, message };
        },
        onManualCodeInput: () =>
          this.requestOAuthInput(flow, {
            kind: "manual_code",
            message: "Paste the authorization code or full redirect URL.",
          }),
        onSelect: (prompt) =>
          this.requestOAuthInput(flow, {
            kind: "select",
            message: prompt.message,
            options: prompt.options,
          }),
        signal: flow.controller.signal,
      });

      if (flow.state.status !== "running") return;
      this.assertPersisted("store subscription credentials");
      this.modelRegistry.refresh();
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

  /**
   * Pi's AuthStorage swallows disk errors (and no-ops entirely when auth.json
   * failed to load) instead of throwing, so a write can silently fail while we
   * report success. Surface any recorded error as a real failure.
   */
  private assertPersisted(action: string): void {
    const errors = this.authStorage.drainErrors();
    if (errors.length > 0) {
      throw new AppRuntimeError(
        "internal",
        `Failed to ${action}: ${errors.map((e) => e.message).join("; ")}`,
        errors,
      );
    }
  }
}

const OAUTH_ONLY_PROVIDERS = new Set(["github-copilot", "openai-codex"]);

function getAuthMethods(providerId: string, supportsOAuth: boolean): AuthMethod[] {
  if (OAUTH_ONLY_PROVIDERS.has(providerId)) return ["oauth"];
  if (supportsOAuth) return ["oauth", "api_key"];
  return ["api_key"];
}

function cloneOAuthState(state: OAuthLoginState): OAuthLoginState {
  return structuredClone(state);
}
