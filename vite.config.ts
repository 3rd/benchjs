import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { copy } from "fs-extra";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig, PluginOption } from "vite";

const isStorybook = process.argv.some((arg) => arg.includes("storybook"));

const bundleMonacoEditor = () => {
  return {
    name: "monaco-plugin",
    async buildStart() {
      const srcPath = resolve(import.meta.dirname, "node_modules/monaco-editor");
      const destPath = resolve(import.meta.dirname, "public/monaco-editor");
      const srcPackageJson = await readFile(resolve(srcPath, "package.json"));
      const destPackageJsonPath = resolve(destPath, "package.json");
      if (
        existsSync(destPackageJsonPath) &&
        srcPackageJson.equals(await readFile(destPackageJsonPath))
      ) {
        return;
      }

      await copy(srcPath, destPath, {
        dereference: true,
        overwrite: true,
      });
      console.log("[vite] bundled monaco-editor");
    },
  } satisfies PluginOption;
};

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  preview: {
    host: "0.0.0.0",
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
      configureServer: async (server) => {
        const headersFile = await readFile(
          resolve(import.meta.dirname, "_headers"),
          "utf8",
        );
        const [pathPattern, ...headerLines] = headersFile.trim().split(/\r?\n/);
        if (pathPattern !== "/*") {
          throw new Error('Expected a global "/*" rule in _headers');
        }
        const headers = headerLines
          .filter((line) => line.trim())
          .map((line) => {
            const separatorIndex = line.indexOf(":");
            if (separatorIndex === -1) {
              throw new Error(`Invalid header rule: ${line}`);
            }
            return {
              name: line.slice(0, separatorIndex).trim(),
              value: line.slice(separatorIndex + 1).trim(),
            };
          });

        server.middlewares.use((_req, res, next) => {
          for (const { name, value } of headers) res.setHeader(name, value);
          next();
        });
      },
    },
  ],
});
