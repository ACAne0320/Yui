import {
  type AppRuntime,
  beginOAuthLoginInputSchema,
  oauthLoginFlowInputSchema,
  removeApiKeyInputSchema,
  respondToOAuthLoginInputSchema,
  setApiKeyInputSchema,
} from "@yui/contracts";
import { desktopIpcChannels } from "../../shared/ipc-channels";
import type { IpcRegistrar } from "./handler";

export function registerAuthIpc(registrar: IpcRegistrar, runtime: AppRuntime): void {
  registrar.handle(desktopIpcChannels.auth.listProviders, () => runtime.auth.listProviders());
  registrar.handleInput(desktopIpcChannels.auth.setApiKey, setApiKeyInputSchema, (_event, input) =>
    runtime.auth.setApiKey(input),
  );
  registrar.handleInput(
    desktopIpcChannels.auth.removeApiKey,
    removeApiKeyInputSchema,
    (_event, input) => runtime.auth.removeApiKey(input),
  );
  registrar.handleInput(
    desktopIpcChannels.auth.beginOAuthLogin,
    beginOAuthLoginInputSchema,
    (_event, input) => runtime.auth.beginOAuthLogin(input),
  );
  registrar.handleInput(
    desktopIpcChannels.auth.getOAuthLoginState,
    oauthLoginFlowInputSchema,
    (_event, input) => runtime.auth.getOAuthLoginState(input),
  );
  registrar.handleInput(
    desktopIpcChannels.auth.respondToOAuthLogin,
    respondToOAuthLoginInputSchema,
    (_event, input) => runtime.auth.respondToOAuthLogin(input),
  );
  registrar.handleInput(
    desktopIpcChannels.auth.cancelOAuthLogin,
    oauthLoginFlowInputSchema,
    (_event, input) => runtime.auth.cancelOAuthLogin(input),
  );
}
