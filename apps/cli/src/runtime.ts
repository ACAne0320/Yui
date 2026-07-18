import { type AppError, AppRuntimeError, type AppRuntime } from "@yui/contracts";
import { createRuntime, resolveRuntimeConfig } from "@yui/runtime";

export async function withRuntime<T>(
  overrides: { cwd?: string },
  fn: (runtime: AppRuntime) => Promise<T>,
): Promise<T> {
  const config = resolveRuntimeConfig(overrides.cwd ? { cwd: overrides.cwd } : {});
  const runtime = await createRuntime(config);
  try {
    return await fn(runtime);
  } finally {
    await runtime.dispose();
  }
}

export function reportError(error: unknown): number {
  if (error instanceof AppRuntimeError) {
    const dto: AppError = error.toJSON();
    process.stderr.write(`error [${dto.code}]: ${dto.message}\n`);
    return 1;
  }
  process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
  return 1;
}
