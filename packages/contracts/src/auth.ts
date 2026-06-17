import { z } from "zod";

export const authMethodSchema = z.enum(["api_key", "oauth"]);
export type AuthMethod = z.infer<typeof authMethodSchema>;

/**
 * Provider authentication status. The runtime returns whether a provider is
 * configured and where its credential comes from. For locally stored API-key
 * credentials it also returns the key itself so this single-user desktop app
 * can echo it back for editing; OAuth/env credentials never expose a secret.
 */
export const providerStatusSchema = z.object({
  providerId: z.string(),
  displayName: z.string(),
  configured: z.boolean(),
  /** Authentication methods this provider supports in Yui. */
  authMethods: z.array(authMethodSchema).min(1),
  /** Stored credential type, absent for environment/config-backed auth. */
  credentialType: authMethodSchema.optional(),
  /** e.g. "apiKey", "oauth", "env"; absent when not configured. */
  authSource: z.string().optional(),
  /**
   * The stored API key, present only when the credential is a plain api-key
   * saved on this machine. Lets the settings UI reveal and edit it.
   */
  apiKey: z.string().optional(),
  availableModelCount: z.number(),
});
export type ProviderStatus = z.infer<typeof providerStatusSchema>;

export const setApiKeyInputSchema = z.object({
  providerId: z.string().min(1),
  apiKey: z.string().min(1),
});
export type SetApiKeyInput = z.infer<typeof setApiKeyInputSchema>;

export const removeApiKeyInputSchema = z.object({
  providerId: z.string().min(1),
});
export type RemoveApiKeyInput = z.infer<typeof removeApiKeyInputSchema>;

export const beginOAuthLoginInputSchema = z.object({
  providerId: z.string().min(1),
});
export type BeginOAuthLoginInput = z.infer<typeof beginOAuthLoginInputSchema>;

export const oauthLoginPromptSchema = z.object({
  requestId: z.string(),
  kind: z.enum(["select", "input", "manual_code"]),
  message: z.string(),
  placeholder: z.string().optional(),
  options: z.array(z.object({ id: z.string(), label: z.string() })).optional(),
});
export type OAuthLoginPrompt = z.infer<typeof oauthLoginPromptSchema>;

export const oauthLoginStateSchema = z.object({
  flowId: z.string(),
  providerId: z.string(),
  providerName: z.string(),
  status: z.enum(["running", "succeeded", "failed", "cancelled"]),
  message: z.string().optional(),
  authUrl: z.string().optional(),
  instructions: z.string().optional(),
  deviceCode: z
    .object({
      userCode: z.string(),
      verificationUri: z.string(),
      expiresInSeconds: z.number().optional(),
    })
    .optional(),
  prompt: oauthLoginPromptSchema.optional(),
});
export type OAuthLoginState = z.infer<typeof oauthLoginStateSchema>;

export const oauthLoginFlowInputSchema = z.object({
  flowId: z.string().min(1),
});
export type OAuthLoginFlowInput = z.infer<typeof oauthLoginFlowInputSchema>;

export const respondToOAuthLoginInputSchema = z.object({
  flowId: z.string().min(1),
  requestId: z.string().min(1),
  response: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("value"), value: z.string() }),
    z.object({ kind: z.literal("cancelled") }),
  ]),
});
export type RespondToOAuthLoginInput = z.infer<typeof respondToOAuthLoginInputSchema>;
