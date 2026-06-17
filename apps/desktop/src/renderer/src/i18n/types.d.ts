import "i18next";
import type { enUS } from "./resources/en-US";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: typeof enUS;
  }
}
