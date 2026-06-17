import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@renderer": resolve(__dirname, "apps/desktop/src/renderer/src"),
    },
  },
  test: {
    // Only Yui workspace packages. The `pi/` directory is a read-only source
    // checkout used for exploration and must not be collected as our test suite.
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "apps/**/*.test.tsx"],
    exclude: ["**/node_modules/**", "pi/**", "dist/**"],
    environmentMatchGlobs: [["apps/desktop/src/renderer/**/*.test.tsx", "jsdom"]],
    environmentOptions: {
      jsdom: {
        url: "http://localhost",
      },
    },
    setupFiles: ["apps/desktop/src/renderer/src/test/setup.ts"],
  },
});
