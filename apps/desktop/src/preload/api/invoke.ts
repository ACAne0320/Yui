import type { AppError } from "@yui/contracts";
import { ipcRenderer } from "electron";
import type { DesktopIpcChannel } from "../../shared/ipc-channels";
import type { DesktopIpcResult } from "../../shared/ipc-result";

export async function invokeDesktop<Output>(
  channel: DesktopIpcChannel,
  input?: unknown,
): Promise<Output> {
  const result = (await ipcRenderer.invoke(channel, input)) as DesktopIpcResult<Output>;

  if (result.ok) {
    return result.value;
  }

  throw result.error satisfies AppError;
}
