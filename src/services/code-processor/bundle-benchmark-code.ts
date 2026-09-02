import { PluginItem } from "@babel/core";
import * as Babel from "@babel/standalone";
import * as esbuild from "esbuild-wasm";
import wasmUrl from "esbuild-wasm/esbuild.wasm?url";
import { Library } from "@/stores/persistentStore";
import { cachedFetch } from "@/services/dependencies/cachedFetch";
import { transform } from "./babel";

const t = Babel.packages.types;

const esbuildPromise =
  typeof window === "undefined" ? Promise.resolve() : esbuild.initialize({ wasmURL: wasmUrl });

// transform import sources to library URLs
const buildImportTransformPlugin = (libraries: Library[]): PluginItem => {
  const plugin: PluginItem = () => ({
    name: "import-transform",
    visitor: {
      ImportDeclaration(path) {
        const source = path.node.source.value;
        const library = libraries.find((lib) => lib.name === source);
        if (library) {
          // eslint-disable-next-line no-param-reassign
          path.node.source = t.stringLiteral(`https://esm.sh/${library.name}`);
        }
      },
    },
  });
  return plugin;
};

// process exported run function
export const runFunctionProcessorPlugin: PluginItem = () => ({
  name: "run-function-processor",
  visitor: {
    // export function run() { ... }
    // export const run = () => { ... }
    // export const run = function() { ... }
    ExportNamedDeclaration(path) {
      const { declaration } = path.node;
      if (!declaration) return;

      // if "export function run() {...}"
      if (t.isFunctionDeclaration(declaration) && t.isIdentifier(declaration.id, { name: "run" })) {
        // -> export default function run() { ... }
        path.replaceWith(t.exportDefaultDeclaration(declaration));
        path.skip();
        return;
      }

      // if "export const run = (...) => { ... }" or "export const run = function(...) {...}"
      if (
        t.isVariableDeclaration(declaration) &&
        declaration.declarations.length === 1 &&
        t.isVariableDeclarator(declaration.declarations[0]) &&
        t.isIdentifier(declaration.declarations[0].id, { name: "run" })
      ) {
        const init = declaration.declarations[0].init;
        if (t.isArrowFunctionExpression(init) || t.isFunctionExpression(init)) {
          // -> arrow/function expression to function declaration
          const body =
            t.isBlockStatement(init.body) ? init.body : t.blockStatement([t.returnStatement(init.body)]);

          const funcDecl = t.functionDeclaration(
            t.identifier("run"),
            init.params,
            body,
            init.generator ?? false,
            init.async,
          );

          // -> export default function run() { ... }
          path.replaceWith(t.exportDefaultDeclaration(funcDecl));
          path.skip();
        }
      }
    },

    // export default function(...) { ... }
    // export default () => { ... }
    // export default function run() { ... }
    ExportDefaultDeclaration(path) {
      const decl = path.node.declaration;

      // if any function-y default export (arrow, function expression, or named function)
      // -> export default function run() { ... }
      if (
        t.isFunctionDeclaration(decl) ||
        t.isArrowFunctionExpression(decl) ||
        t.isFunctionExpression(decl)
      ) {
        const body =
          t.isBlockStatement(decl.body) ? decl.body : t.blockStatement([t.returnStatement(decl.body)]);

        const funcDecl = t.functionDeclaration(
          t.identifier("run"),
          decl.params,
          body,
          decl.generator ?? false,
          decl.async,
        );

        // -> export default function run() { ... }
        path.replaceWith(t.exportDefaultDeclaration(funcDecl));
        path.skip();
      }
    },
  },
});

// wrap discarded expression statements in the benchmark function body with
// blackhole so the JIT cannot dead-code-eliminate the measured work; only the
// task function's direct body is transformed (nested scopes, directives, and
// returns are left alone), matching the benchmate host-guide transform rules
export const blackholeProtectPlugin: PluginItem = () => ({
  name: "blackhole-protect",
  visitor: {
    ExportDefaultDeclaration(path) {
      const declaration = path.node.declaration;
      if (!t.isFunctionDeclaration(declaration)) return;
      for (const statement of declaration.body.body) {
        if (!t.isExpressionStatement(statement)) continue;
        const expression = statement.expression;
        if (t.isAssignmentExpression(expression) || t.isUpdateExpression(expression)) continue;
        statement.expression = t.callExpression(t.identifier("__benchmateBlackhole"), [expression]);
      }
    },
  },
});

// strip other exports
export const stripExportsPlugin: PluginItem = () => ({
  name: "strip-exports",
  visitor: {
    ExportNamedDeclaration(path) {
      const { node } = path;
      if (node.declaration) {
        path.replaceWith(node.declaration);
      } else {
        path.remove();
      }
    },
    ExportDefaultDeclaration(path) {
      const { node } = path;
      if (node.declaration) {
        path.replaceWith(node.declaration);
      } else {
        path.remove();
      }
    },
  },
});

export const bundleBenchmarkCode = async (
  userCode: string,
  setupCode: string,
  libraries: Library[] = [],
  filename?: string,
) => {
  await esbuildPromise;

  // babel transforms; blackhole protection runs as a second pass so it sees the
  // normalized `export default function run()` produced by the first pass
  const normalizedCode = await transform(`${setupCode}\n\n${userCode}`, filename, [
    buildImportTransformPlugin(libraries),
    runFunctionProcessorPlugin,
    stripExportsPlugin,
  ]);
  const protectedCode = await transform(normalizedCode, filename, [blackholeProtectPlugin]);
  const transformedCode = `const __benchmateBlackhole = globalThis.__benchmateBlackhole ?? ((value) => value);\n${protectedCode}`;

  // bundle
  const entryUrl = `${location.protocol}//${location.host}/main.ts`;
  const bundle = await esbuild.build({
    entryPoints: [entryUrl],
    bundle: true,
    format: "esm",
    write: false,
    platform: "browser",
    target: "es2022",
    plugins: [
      {
        name: "browser-resolver",
        async setup(build) {
          build.onResolve({ filter: /^https{0,1}:\/\// }, (args) => ({
            path: args.path,
            namespace: "http",
          }));
          build.onResolve({ filter: /.*/, namespace: "http" }, (args) => ({
            path: new URL(args.path, args.importer).toString(),
            namespace: "http",
          }));
          build.onLoad({ filter: /.*/, namespace: "http" }, async (args) => {
            const url = new URL(args.path);

            let loader: esbuild.Loader = "ts";
            if (url.pathname.endsWith(".tsx")) loader = "tsx";
            if (url.toString() === entryUrl) return { contents: transformedCode, loader };

            const res = await cachedFetch(url);
            if (!res.ok) throw new Error(`Failed to fetch ${url}: status=${res.statusText}`);
            const body = await res.text();

            return { contents: body, loader };
          });
        },
      },
    ],
  });
  const { outputFiles } = bundle;
  if (outputFiles.length !== 1) {
    console.log("Bundle failure:", { transformedCode, bundle });
    throw new Error("Failed to bundle code");
  }
  const code = outputFiles[0].text;
  return code;
};
