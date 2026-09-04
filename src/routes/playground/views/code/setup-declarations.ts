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

const transformToGlobalDeclarations = (dts: string) => {
  return `declare global {
${dts
  .replace(/export declare/g, "declare")
  .replace(/export interface/g, "interface")
  .replace(/^export type(?!\s*[{*])/gm, "type")
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
