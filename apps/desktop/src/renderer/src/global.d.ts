import type { YuiDesktopApi } from "../../shared/desktop-api";

declare global {
  interface Window {
    yui: YuiDesktopApi;
  }
}
