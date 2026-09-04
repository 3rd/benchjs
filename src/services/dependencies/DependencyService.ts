import { Monaco as MonacoEditor } from "@monaco-editor/react";
import { editor as RawMonacoEditor } from "monaco-editor";
import { Dependency, useDependenciesStore } from "@/stores/dependenciesStore";
import { Library } from "@/stores/persistentStore";
import { createATA } from "@/services/dependencies/ata";
import { cachedFetch } from "@/services/dependencies/cachedFetch";

const PACKAGE_SPEC_PATTERN = /^(@?[^@]+)(?:@(.*))?$/;

export const parsePackageSpec = (spec: string) => {
  const match = PACKAGE_SPEC_PATTERN.exec(spec);
  return match ?
      { packageName: match[1], versionSpec: match[2] ?? null }
    : { packageName: spec, versionSpec: null };
};

export const getPackageNameFromSpec = (spec: string) => parsePackageSpec(spec).packageName;

type DependencyMonaco = {
  languages: {
    typescript: {
      javascriptDefaults: Pick<MonacoEditor["languages"]["typescript"]["javascriptDefaults"], "addExtraLib">;
      typescriptDefaults: Pick<MonacoEditor["languages"]["typescript"]["typescriptDefaults"], "addExtraLib">;
    };
  };
};

type RegisteredTypeFile = {
  content: string;
  registration: {
    dispose: () => void;
  };
};

class DependencyService {
  activeLibraries = new Set<string>();
  private libraryInstallations = new Map<string, Promise<void>>();
  typeFilesByLibrary = new Map<string, Map<string, string>>();
  registeredTypeFiles = new Map<string, RegisteredTypeFile>();
  monaco: DependencyMonaco | null = null;

  async acquireTypes(libraryName: string, typeFiles: Map<string, string>) {
    const ata = createATA({
      fetcher: cachedFetch,
      handlers: {
        receivedFile: (content: string, path: string) => {
          if (this.typeFilesByLibrary.get(libraryName) !== typeFiles) return;
          typeFiles.set(path, content);
        },
      },
    });
    const { packageName, versionSpec } = parsePackageSpec(libraryName);
    const versionAnnotation = versionSpec ? ` // types: ${versionSpec}` : "";
    await ata(`import "${packageName}"${versionAnnotation}`);
    if (this.typeFilesByLibrary.get(libraryName) === typeFiles) {
      this.syncExtraLibs();
    }
  }

  addExtraLib(content: string, path: string) {
    if (!this.monaco) return;
    const filePath = `file://${path}`;
    const registrations = [
      this.monaco.languages.typescript.javascriptDefaults.addExtraLib(content, filePath),
      this.monaco.languages.typescript.typescriptDefaults.addExtraLib(content, filePath),
    ];
    return {
      dispose: () => {
        for (const registration of registrations) registration.dispose();
      },
    };
  }

  syncExtraLibs() {
    if (!this.monaco) return;

    const activeTypeFiles = new Map<string, string>();
    for (const libraryName of this.activeLibraries) {
      const typeFiles = this.typeFilesByLibrary.get(libraryName);
      if (!typeFiles) continue;
      for (const [path, content] of typeFiles) {
        activeTypeFiles.set(path, content);
      }
    }

    for (const [path, registeredTypeFile] of this.registeredTypeFiles) {
      if (activeTypeFiles.get(path) === registeredTypeFile.content) continue;
      registeredTypeFile.registration.dispose();
      this.registeredTypeFiles.delete(path);
    }

    for (const [path, content] of activeTypeFiles) {
      if (this.registeredTypeFiles.has(path)) continue;
      const registration = this.addExtraLib(content, path);
      if (!registration) continue;
      this.registeredTypeFiles.set(path, {
        content,
        registration,
      });
    }
  }

  mountEditor(_editor: RawMonacoEditor.IStandaloneCodeEditor, monaco: MonacoEditor) {
    this.unmountEditor();
    this.monaco = monaco;
    this.syncExtraLibs();
  }

  unmountEditor() {
    for (const registeredTypeFile of this.registeredTypeFiles.values()) {
      registeredTypeFile.registration.dispose();
    }
    this.registeredTypeFiles.clear();
    this.monaco = null;
  }

  dispose() {
    this.activeLibraries.clear();
    this.libraryInstallations.clear();
    this.typeFilesByLibrary.clear();
    this.unmountEditor();
  }

  removeLibrary(libraryName: string) {
    this.activeLibraries.delete(libraryName);
    this.libraryInstallations.delete(libraryName);
    this.typeFilesByLibrary.delete(libraryName);
    useDependenciesStore.getState().removeDependency(libraryName);
    this.syncExtraLibs();
  }

  async syncLibraries(libraries: Library[]) {
    const libraryNames = new Set(libraries.map((library) => library.name));
    for (const libraryName of this.activeLibraries) {
      if (!libraryNames.has(libraryName)) this.removeLibrary(libraryName);
    }
    await Promise.all(libraries.map((library) => this.addLibrary(library)));
  }

  private async installLibrary(library: Library, dependency?: Dependency) {
    const typeFiles = new Map<string, string>();
    this.typeFilesByLibrary.set(library.name, typeFiles);
    this.syncExtraLibs();
    const isCurrentLibrary = () =>
      this.activeLibraries.has(library.name) && this.typeFilesByLibrary.get(library.name) === typeFiles;
    let failureMessage = "Failed to fetch package.json";

    try {
      if (dependency?.status !== "success") {
        const item: Dependency = {
          name: library.name,
          url: `https://esm.sh/${library.name}`,
          status: "loading",
        };
        useDependenciesStore.getState().setDependency(item);

        const response = await cachedFetch(`${item.url}/package.json`);
        if (!isCurrentLibrary()) return;
        if (!response.ok) {
          const responseFailure = response.statusText || `HTTP ${response.status}`;
          useDependenciesStore.getState().updateDependency(item.name, {
            status: "error",
            error: `${failureMessage}: ${responseFailure}`,
          });
          return;
        }

        failureMessage = "Failed to parse package.json";
        const packageJson = await response.json();
        if (!isCurrentLibrary()) return;
        useDependenciesStore.getState().updateDependency(item.name, {
          package: packageJson,
        });
      }

      failureMessage = "Failed to acquire types";
      await this.acquireTypes(library.name, typeFiles);
      if (!isCurrentLibrary()) return;
      useDependenciesStore.getState().updateDependency(library.name, {
        status: "success",
        error: undefined,
      });
    } catch (error) {
      if (!isCurrentLibrary()) return;
      typeFiles.clear();
      this.syncExtraLibs();
      const message = error instanceof Error ? error.message : String(error);
      useDependenciesStore.getState().updateDependency(library.name, {
        status: "error",
        error: `${failureMessage}: ${message}`,
      });
    }
  }

  async addLibrary(library: Library) {
    this.activeLibraries.add(library.name);
    this.syncExtraLibs();

    const currentInstallation = this.libraryInstallations.get(library.name);
    if (currentInstallation) {
      await currentInstallation;
      return;
    }

    const dependency = useDependenciesStore.getState().dependencyMap[library.name];
    const existingTypeFiles = this.typeFilesByLibrary.get(library.name);
    if (dependency?.status === "success" && existingTypeFiles) return;

    const installation = this.installLibrary(library, dependency);
    this.libraryInstallations.set(library.name, installation);
    try {
      await installation;
    } finally {
      if (this.libraryInstallations.get(library.name) === installation) {
        this.libraryInstallations.delete(library.name);
      }
    }
  }
}

export { DependencyService };
