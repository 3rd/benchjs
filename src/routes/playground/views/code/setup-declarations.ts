import * as Babel from "@babel/standalone";
import type { PluginItem } from "@babel/core";
import type { DependencyService } from "@/services/dependencies";
import type { Library } from "@/stores/persistentStore";

interface GenerateSetupDeclarationsOptions {
  dependencyService: Pick<DependencyService, "syncLibraries">;
  emitDeclarations: () => Promise<string | null>;
  isCurrent: () => boolean;
  libraries: Library[];
}

interface SetupDeclarationIdentityInput {
  documentId: string;
  libraries: Library[];
  setupCode: string;
}

export interface SetupDeclarationIdentity {
  documentId: string;
  libraryEnvironmentKey: string;
  setupCode: string;
}

export interface SetupDeclarations extends SetupDeclarationIdentity {
  content: string;
}

const projectMutableSetupAliasesPlugin: PluginItem = () => ({
  name: "mutable-setup-aliases",
  visitor: {
    ExportNamedDeclaration(path) {
      const isLocalValueExport = !path.node.source && path.node.exportKind !== "type";
      if (!isLocalValueExport) return;

      const t = Babel.packages.types;

      for (const specifier of path.get("specifiers")) {
        if (!specifier.isExportSpecifier()) continue;
        if (specifier.node.exportKind === "type") continue;

        const { local, exported } = specifier.node;
        if (!t.isIdentifier(local)) continue;

        const exportedName = t.isIdentifier(exported) ? exported.name : exported.value;
        if (!t.isValidIdentifier(exportedName)) continue;

        const binding = path.scope.getBinding(local.name);
        if (!binding?.path.isVariableDeclarator()) continue;

        const kind = binding.kind;
        const isMutable = kind === "let" || kind === "var";
        if (!isMutable) continue;

        if (exportedName === local.name) {
          path.scope.rename(local.name);
        }

        const identifier = t.identifier(exportedName);
        identifier.typeAnnotation = t.tsTypeAnnotation(t.tsTypeQuery(t.identifier(binding.identifier.name)));

        path.insertAfter(
          t.exportNamedDeclaration(
            t.variableDeclaration(kind, [t.variableDeclarator(identifier)]),
          ),
        );
        specifier.remove();
      }
    },
  },
});

const transformToGlobalDeclarations = (dts: string) => {
  const result = Babel.transform(dts, {
    babelrc: false,
    configFile: false,
    sourceType: "module",
    parserOpts: { plugins: ["typescript"] },
    plugins: [projectMutableSetupAliasesPlugin],
  });

  const code = result?.code;
  if (code == null) {
    throw new Error("Failed to transform setup declarations");
  }

  return `declare global {
${code
  .split("\n")
  .map((line) => `  ${line}`)
  .join("\n")}
}

export {};`;
};

export const getSetupDeclarationIdentity = ({
  documentId,
  libraries,
  setupCode,
}: SetupDeclarationIdentityInput) => {
  return {
    documentId,
    libraryEnvironmentKey: JSON.stringify(
      libraries.map((library) => library.name).sort(),
    ),
    setupCode,
  };
};

export const isSameSetupDeclarationIdentity = (
  first: SetupDeclarationIdentity,
  second: SetupDeclarationIdentity,
) => {
  return (
    first.documentId === second.documentId &&
    first.libraryEnvironmentKey === second.libraryEnvironmentKey &&
    first.setupCode === second.setupCode
  );
};

export const getCurrentSetupDeclarationContent = (
  setupDeclarations: SetupDeclarations | null,
  setupDeclarationIdentity: SetupDeclarationIdentity,
) => {
  if (!setupDeclarations) return null;
  if (
    !isSameSetupDeclarationIdentity(setupDeclarations, setupDeclarationIdentity)
  )
    return null;
  return setupDeclarations.content;
};

export const generateSetupDeclarations = async ({
  dependencyService,
  emitDeclarations,
  isCurrent,
  libraries,
}: GenerateSetupDeclarationsOptions) => {
  await dependencyService.syncLibraries(libraries);
  if (!isCurrent()) return null;

  const dts = await emitDeclarations();
  if (!dts || !isCurrent()) return null;

  return transformToGlobalDeclarations(dts);
};
