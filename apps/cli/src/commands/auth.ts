import { removeApiKeyInputSchema, setApiKeyInputSchema } from "@yui/contracts";
import { printJson, printProviders } from "../output/format.ts";
import { readSecret } from "../output/secret.ts";
import { reportError, withRuntime } from "../runtime.ts";

export async function authSet(provider: string, apiKeyArg?: string): Promise<number> {
  // Either pass the key directly or enter it at a masked prompt. Provider's own
  // standard env var (e.g. ANTHROPIC_API_KEY) is already honored by the runtime.
  const apiKey = apiKeyArg ?? (await readSecret(`API key for ${provider}: `));

  const parsed = setApiKeyInputSchema.safeParse({ providerId: provider, apiKey });
  if (!parsed.success) {
    process.stderr.write("error: a non-empty provider and API key are required\n");
    return 1;
  }

  try {
    return await withRuntime({}, async (runtime) => {
      await runtime.auth.setApiKey(parsed.data);
      process.stdout.write(`Stored API key for ${provider}.\n`);
      return 0;
    });
  } catch (error) {
    return reportError(error);
  }
}

export async function authRemove(provider: string): Promise<number> {
  const parsed = removeApiKeyInputSchema.safeParse({ providerId: provider });
  if (!parsed.success) {
    process.stderr.write("error: a non-empty provider is required\n");
    return 1;
  }

  try {
    return await withRuntime({}, async (runtime) => {
      await runtime.auth.removeApiKey(parsed.data);
      process.stdout.write(`Removed credentials for ${provider}.\n`);
      return 0;
    });
  } catch (error) {
    return reportError(error);
  }
}

export async function authList(opts: { json?: boolean }): Promise<number> {
  try {
    return await withRuntime({}, async (runtime) => {
      const providers = await runtime.auth.listProviders();
      if (opts.json) printJson(providers);
      else printProviders(providers);
      return 0;
    });
  } catch (error) {
    return reportError(error);
  }
}
