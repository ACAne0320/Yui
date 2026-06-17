import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

export default defineConfig({
  main: {
    build: {
      // Workspace packages publish TypeScript source during development. Bundle
      // them so Electron never tries to execute that source in Node strip-only mode.
      // The Pi packages must stay external (declared in this package.json so the
      // default externalization picks them up and pnpm links them): Pi's extension
      // loader resolves jiti aliases (its own entry, typebox) relative to its real
      // on-disk package location, which breaks when bundled — every user extension
      // would fail to load.
      externalizeDeps: {
        exclude: ["@yui/contracts", "@yui/runtime"],
      },
      rollupOptions: {
        input: resolve(__dirname, "src/main/index.ts"),
        // The Pi packages are ESM-only (exports carry only an `import`
        // condition), so the main bundle must be ESM to load them externally.
        // Preload stays CJS: sandboxed preload scripts cannot use ESM.
        output: {
          format: "es",
        },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: resolve(__dirname, "src/preload/index.ts"),
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@renderer": resolve(__dirname, "src/renderer/src"),
      },
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, "src/renderer/index.html"),
      },
    },
  },
});
