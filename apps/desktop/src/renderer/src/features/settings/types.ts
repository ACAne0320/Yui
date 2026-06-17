import type { AppDefaults, AppModel, ProviderStatus } from "@yui/contracts";

export interface ProviderPanelProps {
  providers: ProviderStatus[];
  models: AppModel[];
  defaults: AppDefaults;
  selectedId: string;
  onSelect: (providerId: string) => void;
}
