import { setDefaultModelInputSchema, thinkingLevelSchema } from "@yui/contracts";
import { printDefaults, printJson } from "../output/format.ts";
import { reportError, withRuntime } from "../runtime.ts";

export async function configShow(opts: { json?: boolean }): Promise<number> {
  try {
    return await withRuntime({}, async (runtime) => {
      const defaults = await runtime.settings.getDefaults();
      if (opts.json) printJson(defaults);
      else printDefaults(defaults);
      return 0;
    });
  } catch (error) {
    return reportError(error);
  }
}

/** Accepts a single `provider/model` token (matching `models list` output). */
export async function configSetModel(ref: string): Promise<number> {
  const slash = ref.indexOf("/");
  if (slash <= 0 || slash === ref.length - 1) {
    process.stderr.write("error: expected <provider/model>, e.g. anthropic/claude-opus-4-8\n");
    return 1;
  }
  const parsed = setDefaultModelInputSchema.safeParse({
    providerId: ref.slice(0, slash),
    modelId: ref.slice(slash + 1),
  });
  if (!parsed.success) {
    process.stderr.write("error: a non-empty provider and model are required\n");
    return 1;
  }

  try {
    return await withRuntime({}, async (runtime) => {
      await runtime.settings.setDefaultModel(parsed.data);
      process.stdout.write(
        `Default model set to ${parsed.data.providerId}/${parsed.data.modelId}.\n`,
      );
      return 0;
    });
  } catch (error) {
    return reportError(error);
  }
}

export async function configSetThinking(level: string): Promise<number> {
  const parsed = thinkingLevelSchema.safeParse(level);
  if (!parsed.success) {
    process.stderr.write(
      "error: thinking level must be one of off, minimal, low, medium, high, xhigh\n",
    );
    return 1;
  }

  try {
    return await withRuntime({}, async (runtime) => {
      await runtime.settings.setDefaultThinkingLevel({ thinkingLevel: parsed.data });
      process.stdout.write(`Default thinking level set to ${parsed.data}.\n`);
      return 0;
    });
  } catch (error) {
    return reportError(error);
  }
}
