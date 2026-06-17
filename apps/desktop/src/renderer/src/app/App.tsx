import { AppProviders } from "./providers";
import { Surface } from "./Surface";

export function App() {
  return (
    <AppProviders>
      <Surface />
    </AppProviders>
  );
}
