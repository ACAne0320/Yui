import { AppRuntimeError, type AppError } from "@yui/contracts";
import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import type { DesktopIpcChannel } from "../../shared/ipc-channels";
import type { DesktopIpcResult } from "../../shared/ipc-result";
import { assertTrustedSender } from "./sender";

interface InputSchema<Input> {
  safeParse(input: unknown): { success: true; data: Input } | { success: false };
}

type MaybePromise<T> = T | Promise<T>;

export interface IpcRegistrar {
  handle<Output>(
    channel: DesktopIpcChannel,
    handler: (event: IpcMainInvokeEvent) => MaybePromise<Output>,
  ): void;
  handleInput<Input, Output>(
    channel: DesktopIpcChannel,
    schema: InputSchema<Input>,
    handler: (event: IpcMainInvokeEvent, input: Input) => MaybePromise<Output>,
  ): void;
  unregister(): void;
}

export function createIpcRegistrar(getMainWindow: () => BrowserWindow | null): IpcRegistrar {
  const channels = new Set<DesktopIpcChannel>();

  const register = <Output>(
    channel: DesktopIpcChannel,
    handler: (event: IpcMainInvokeEvent, rawInput: unknown) => MaybePromise<Output>,
  ): void => {
    channels.add(channel);
    ipcMain.handle(channel, async (event, rawInput): Promise<DesktopIpcResult<Output>> => {
      try {
        assertTrustedSender(event.sender, getMainWindow);
        return { ok: true, value: await handler(event, rawInput) };
      } catch (error) {
        return { ok: false, error: toAppError(channel, error) };
      }
    });
  };

  return {
    handle(channel, handler) {
      register(channel, (event) => handler(event));
    },
    handleInput(channel, schema, handler) {
      register(channel, (event, rawInput) => {
        const parsed = schema.safeParse(rawInput);
        if (!parsed.success) {
          throw new AppRuntimeError("invalid_input", "Invalid IPC input.");
        }
        return handler(event, parsed.data);
      });
    },
    unregister() {
      for (const channel of channels) {
        ipcMain.removeHandler(channel);
      }
      channels.clear();
    },
  };
}

function toAppError(channel: DesktopIpcChannel, error: unknown): AppError {
  if (error instanceof AppRuntimeError) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  // The renderer only gets the sanitized message below, so an unexpected error
  // would otherwise vanish entirely; keep the original visible in the main log.
  console.error(`IPC handler failed [${channel}]:`, error);
  return {
    code: "internal",
    message: "An internal desktop error occurred.",
  };
}
