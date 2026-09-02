import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { copy } from "fs-extra";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, PluginOption } from "vite";

const isStorybook = process.argv.some((arg) => arg.includes("storybook"));

const bundleMonacoEditor = () => {
  return {
    name: "monaco-plugin",
    async buildStart() {
      const srcPath = resolve(import.meta.dirname, "node_modules/monaco-editor");
      const destPath = resolve(import.meta.dirname, "public/monaco-editor");
      if (!existsSync(destPath)) {
        await copy(srcPath, destPath, {
          dereference: true,
          overwrite: true,
        });
        console.log("[vite] bundled monaco-editor");
      }
    },
  } satisfies PluginOption;
};

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  worker: {
    format: "es",
  },
  plugins: [
    //
    !isStorybook && reactRouter(),
    tailwindcss(),
    bundleMonacoEditor(),
    {
      // cross-origin isolation gives worker performance.now() microsecond resolution;
      // without it the clock is quantized to 100us and benchmate ends runs timer-limited
      name: "configure-response-headers",
      configureServer: (server) => {
        server.middlewares.use((_req, res, next) => {
          // credentialless instead of require-corp so the CORP-less umami tracker still loads
          res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
          res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
          next();
        });
      },
    },
  ],
});
