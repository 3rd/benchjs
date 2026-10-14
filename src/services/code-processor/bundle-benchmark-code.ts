import * as Babel from "@babel/standalone";
import * as esbuild from "esbuild-wasm";
import wasmUrl from "esbuild-wasm/esbuild.wasm?url";
import type { NodePath, PluginItem } from "@babel/core";
import { Library } from "@/stores/persistentStore";
import { cachedFetch } from "@/services/dependencies/cachedFetch";
import { getPackageNameFromSpec } from "@/services/dependencies/DependencyService";
import { transform } from "./babel";

const t = Babel.packages.types;

const esbuildPromise =
  typeof window === "undefined" ? Promise.resolve() : esbuild.initialize({ wasmURL: wasmUrl });

const resolveFunctionBinding = (path: NodePath, name: string) => {
  const binding = path.scope.getBinding(name);
  if (!binding) return null;

  let runFunction;
  if (binding.path.isFunctionDeclaration()) {
    runFunction = binding.path.node;
  } else if (binding.path.isVariableDeclarator()) {
    const { init } = binding.path.node;
    if (t.isArrowFunctionExpression(init) || t.isFunctionExpression(init)) runFunction = init;
  }

  if (!runFunction) return null;
  if (!binding.constant) {
    throw path.buildCodeFrameError("The benchmark run function must not be reassigned");
  }
  return runFunction;
};

const protectDiscardedExpressions = (runFunction: NonNullable<ReturnType<typeof resolveFunctionBinding>>) => {
  if (!t.isBlockStatement(runFunction.body)) return;
  for (const statement of runFunction.body.body) {
    if (!t.isExpressionStatement(statement)) continue;
    const expression = statement.expression;
    if (t.isAssignmentExpression(expression) || t.isUpdateExpression(expression)) continue;
    statement.expression = t.callExpression(t.identifier("__benchmateBlackhole"), [expression]);
  }
};

// transform import sources to library URLs
export const buildImportTransformPlugin = (libraries: Library[]): PluginItem => {
  const plugin: PluginItem = () => ({
    name: "import-transform",
    visitor: {
      ImportDeclaration(path) {
        const source = path.node.source.value;
        const library = libraries.find((lib) => {
          const packageName = getPackageNameFromSpec(lib.name);
          return (
            source === lib.name ||
            source.startsWith(`${lib.name}/`) ||
            source === packageName ||
            source.startsWith(`${packageName}/`)
          );
        });
        if (!library) return;

        const packageName = getPackageNameFromSpec(library.name);
        let subpath = "";
        if (source.startsWith(`${library.name}/`)) {
          subpath = source.slice(library.name.length);
        } else if (source.startsWith(`${packageName}/`)) {
          subpath = source.slice(packageName.length);
        }
        // eslint-disable-next-line no-param-reassign
        path.node.source = t.stringLiteral(`https://esm.sh/${library.name}${subpath}`);
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
      const { declaration, source, specifiers } = path.node;
      if (!declaration) {
        if (source) return;

        for (const specifier of specifiers) {
          if (!t.isExportSpecifier(specifier) || !t.isIdentifier(specifier.local)) continue;
          const exportedName =
            t.isIdentifier(specifier.exported) ? specifier.exported.name : specifier.exported.value;
          if (exportedName !== "run" && exportedName !== "default") continue;
          if (!resolveFunctionBinding(path, specifier.local.name)) continue;

          path.replaceWith(t.exportDefaultDeclaration(t.identifier(specifier.local.name)));
          path.skip();
          return;
        }
        return;
      }

      // if "export function run() {...}"
      if (t.isFunctionDeclaration(declaration) && t.isIdentifier(declaration.id, { name: "run" })) {
        // -> export default function run() { ... }
        path.replaceWith(t.exportDefaultDeclaration(declaration));
        path.skip();
        return;
      }

      // if "export const run = (...) => { ... }" or "export const run = function(...) {...}"
      if (t.isVariableDeclaration(declaration)) {
        const runDeclaration = declaration.declarations.find((item) =>
          t.isIdentifier(item.id, { name: "run" }),
        );
        if (!runDeclaration) return;

        const init = runDeclaration.init;
        if (t.isArrowFunctionExpression(init) || t.isFunctionExpression(init)) {
          const shouldPreserveDeclaration =
            declaration.declarations.length > 1 ||
            (t.isFunctionExpression(init) && init.id != null);
          if (shouldPreserveDeclaration) {
            const replacementPaths = path.replaceWithMultiple([
              declaration,
              t.exportDefaultDeclaration(t.identifier("run")),
            ]);
            for (const replacementPath of replacementPaths) {
              if (replacementPath.isExportDefaultDeclaration()) replacementPath.skip();
            }
            return;
          }

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

      if (t.isIdentifier(decl)) {
        if (resolveFunctionBinding(path, decl.name)) path.skip();
        return;
      }

      if ((t.isFunctionDeclaration(decl) || t.isFunctionExpression(decl)) && decl.id) {
        path.skip();
        return;
      }

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
      if (t.isFunctionDeclaration(declaration) || t.isFunctionExpression(declaration)) {
        protectDiscardedExpressions(declaration);
        return;
      }
      if (!t.isIdentifier(declaration)) return;

      const runFunction = resolveFunctionBinding(path, declaration.name);
      if (runFunction) protectDiscardedExpressions(runFunction);
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

interface ImplementationNames {
  declared: ReadonlySet<string>;
  used: ReadonlySet<string>;
}

const collectImplementationNames = (userCode: string, filename = "main.tsx") => {
  const declared = new Set<string>();
  const used = new Set<string>();

  Babel.transform(userCode, {
    filename,
    babelrc: false,
    configFile: false,
    sourceType: "module",
    presets: ["typescript"],
    code: false,
    plugins: [
      () => ({
        name: "collect-implementation-names",
        visitor: {
          Identifier(path) {
            used.add(path.node.name);
          },
          Program: {
            exit(path) {
              path.scope.crawl();

              for (const name of Object.keys(path.scope.bindings)) {
                declared.add(name);
              }
            },
          },
        },
      }),
    ],
  });

  return { declared, used } satisfies ImplementationNames;
};

const buildSetupIsolationPlugin = (implementationNames: ImplementationNames) => {
  const exportedBindings = new Map<string, string>();

  const plugin: PluginItem = () => ({
    name: "setup-isolation",
    visitor: {
      Program: {
        exit(path) {
          path.scope.crawl();

          for (const [name, binding] of Object.entries(path.scope.bindings)) {
            const declaration =
              binding.path.isVariableDeclarator() ? binding.path.parentPath?.parentPath : binding.path.parentPath;
            const exportedNames = new Set<string>();

            if (declaration?.isExportNamedDeclaration()) {
              exportedNames.add(name);
            }

            for (const reference of binding.referencePaths) {
              const specifier = reference.parentPath;
              if (!specifier?.isExportSpecifier()) continue;

              const exportedName = specifier.node.exported;
              exportedNames.add(t.isIdentifier(exportedName) ? exportedName.name : exportedName.value);
            }

            const canExposeLocalName =
              exportedNames.size === 1 &&
              exportedNames.has(name) &&
              !implementationNames.declared.has(name);
            let localName = name;

            if (!canExposeLocalName) {
              localName = path.scope.generateUid(name);

              while (implementationNames.used.has(localName)) {
                localName = path.scope.generateUid(name);
              }

              path.scope.rename(name, localName);
            }

            for (const exportedName of exportedNames) {
              exportedBindings.set(exportedName, localName);
            }
          }
        },
      },
    },
  });

  return { plugin, exportedBindings };
};

const buildSetupReferencePlugin = (exportedBindings: ReadonlyMap<string, string>) => {
  const plugin: PluginItem = () => ({
    name: "setup-references",
    visitor: {
      Identifier(path) {
        const name = path.node.name;
        const localName = exportedBindings.get(name);
        if (!localName) return;

        const isReference = path.isReferencedIdentifier();
        const isBinding = path.isBindingIdentifier();
        const isFreeSetupReference =
          localName !== name &&
          !path.scope.getBinding(name) &&
          (isReference || isBinding);
        if (!isFreeSetupReference) return;

        path.replaceWith(t.identifier(localName));
        path.skip();
      },
    },
  });

  return plugin;
};

const isolateSetupCode = async (
  setupCode: string,
  libraries: Library[],
  implementationNames: ImplementationNames,
) => {
  const { plugin, exportedBindings } = buildSetupIsolationPlugin(implementationNames);
  const isolatedSetupCode = await transform(setupCode, "setup.ts", [
    buildImportTransformPlugin(libraries),
    plugin,
  ]);
  const code = await transform(isolatedSetupCode, "setup.ts", [stripExportsPlugin]);
  return { code, exportedBindings };
};

export const bundleBenchmarkCode = async (
  userCode: string,
  setupCode: string,
  libraries: Library[] = [],
  filename?: string,
) => {
  await esbuildPromise;

  const implementationNames = collectImplementationNames(userCode, filename);
  const setupModule = await isolateSetupCode(setupCode, libraries, implementationNames);
  const strippedUserCode = await transform(userCode, filename, [
    buildSetupReferencePlugin(setupModule.exportedBindings),
  ]);
  const normalizedCode = await transform(`${setupModule.code}\n\n${strippedUserCode}`, filename, [
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
