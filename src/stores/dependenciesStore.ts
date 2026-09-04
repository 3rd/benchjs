import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type Dependency = {
  name: string;
  url: string;
  status: "error" | "loading" | "success";
  package?: {
    name: string;
    version: string;
    description: string;
    author?: string;
    license?: string;
    homepage?: string;
  };
  error?: string;
};

interface DependenciesState {
  dependencyMap: Record<string, Dependency>;
  setDependency: (dependency: Dependency) => void;
  updateDependency: (dependencyName: string, data: Partial<Omit<Dependency, "name">>) => void;
  removeDependency: (dependencyName: string) => void;
  reset: () => void;
}

export const useDependenciesStore = create<DependenciesState>()(
  devtools(
    (set) => ({
      dependencyMap: {},
      setDependency: (dependency) => {
        set((state) => ({
          dependencyMap: {
            ...state.dependencyMap,
            [dependency.name]: dependency,
          },
        }));
      },
      updateDependency: (dependencyName, data) => {
        set((state) => {
          const dependency = state.dependencyMap[dependencyName];
          if (!dependency) return state;
          return {
            dependencyMap: {
              ...state.dependencyMap,
              [dependencyName]: {
                ...dependency,
                ...data,
              },
            },
          };
        });
      },
      removeDependency: (dependencyName) => {
        set((state) => ({
          dependencyMap: Object.fromEntries(
            Object.entries(state.dependencyMap).filter(([name]) => name !== dependencyName),
          ),
        }));
      },
      reset: () => {
        set({ dependencyMap: {} });
      },
    }),
    { name: "dependencies" },
  ),
);
