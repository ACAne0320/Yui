import { printJson, printModels } from "../output/format.ts";
import { reportError, withRuntime } from "../runtime.ts";

export async function modelsList(opts: { json?: boolean }): Promise<number> {
  try {
    return await withRuntime({}, async (runtime) => {
      const models = await runtime.models.listAvailable();
      if (opts.json) printJson(models);
      else printModels(models);
      return 0;
    });
  } catch (error) {
    return reportError(error);
  }
}
