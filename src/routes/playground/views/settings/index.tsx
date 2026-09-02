import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Trash2 } from "lucide-react";
import { useDependenciesStore } from "@/stores/dependenciesStore";
import { getCurrentDocument, usePersistentStore } from "@/stores/persistentStore";
import { cache } from "@/services/dependencies/cache";
import { DependencyService } from "@/services/dependencies/DependencyService";
import { searchNpmPackages } from "@/services/dependencies/npmSearch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface SettingsViewProps {
  dependencyService: DependencyService;
}

export function SettingsView({ dependencyService }: SettingsViewProps) {
  const store = usePersistentStore();
  const currentDocument = getCurrentDocument(store);
  const dependencies = useDependenciesStore();
  const [libraryName, setLibraryName] = useState("");
  const [cacheCount, setCacheCount] = useState(0);
  const [suggestions, setSuggestions] = useState<ComboboxOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const getStatusBadge = (status: "error" | "loading" | "success") => {
    if (status === "error") return <Badge variant="destructive">{status}</Badge>;
    if (status === "loading") return <Badge variant="outline">{status}</Badge>;
    return <Badge variant="success">{status}</Badge>;
  };

  const getPackageNameFromSpec = (spec: string): string => {
    const match = spec.match(/^(@?[^@]+)(?:@.+)?$/);
    return match ? match[1] : spec;
  };

  const addPackage = async (packageSpec: string, packageNameFromOption?: string) => {
    if (!packageSpec.trim()) return;
    const trimmedName = packageSpec.trim();
    const packageName = packageNameFromOption || getPackageNameFromSpec(trimmedName);

    const libsToRemove = currentDocument.libraries.filter((lib) => {
      const libPackageName = getPackageNameFromSpec(lib.name);
      return libPackageName === packageName;
    });

    libsToRemove.forEach((lib) => {
      store.removeLibrary(lib.name);
    });

    setLibraryName("");
    setSuggestions([]);
    store.addLibrary(trimmedName);
    await dependencyService.addLibrary({ name: trimmedName });
    setCacheCount(await cache.count());
  };

  const handleAddLibrary = async () => {
    const selectedOption = suggestions.find((opt) => opt.value === libraryName.trim());
    await addPackage(libraryName, selectedOption?.packageName);
  };

  const handleSelectPackage = async (packageValue: string) => {
    const selectedOption = suggestions.find((opt) => opt.value === packageValue.trim());
    await addPackage(packageValue, selectedOption?.packageName);
  };

  const handleSearchChange = (query: string) => {
    setLibraryName(query);
    setSearchError(null);

    // cancel previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // don't search if query is too short
    if (query.trim().length < 2) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    // debounce search
    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const results = await searchNpmPackages(query, 10, controller.signal);
        if (controller.signal.aborted) return;

        const isVersionSelection = query.trim().endsWith("@");

        const options: ComboboxOption[] = results.map((pkg) => ({
          value: pkg.name,
          label: isVersionSelection ? pkg.version : pkg.name,
          description: pkg.description,
          metadata: pkg.version,
          packageName: pkg.packageName,
          monthlyDownloads: pkg.monthlyDownloads,
          license: pkg.license,
        }));

        setSuggestions(options);
        setSearchError(null);
      } catch (error) {
        if (controller.signal.aborted) return;
        setSearchError(error instanceof Error ? error.message : "Failed to search packages");
        setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      }
    }, 300);
  };

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleRemoveLibrary = (name: string) => {
    store.removeLibrary(name);
  };

  const handleClearCache = async () => {
    await cache.clear();
    setCacheCount(0);
  };

  // update cache size
  useEffect(() => {
    cache.count().then(setCacheCount);
  }, []);

  return (
    <div className="container py-8 px-4 mx-auto">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Settings</h1>

      <AnimatePresence>
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          initial={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                <span>Dependencies</span>
                <Button variant="outline" onClick={handleClearCache}>
                  Clear Cache {cacheCount > 0 && `(${cacheCount})`}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* add library */}
                <div className="flex gap-2">
                  <Combobox
                    className="flex-1"
                    placeholder="Search packages..."
                    value={libraryName}
                    onChange={handleSearchChange}
                    onSelect={handleSelectPackage}
                    options={suggestions}
                    isLoading={isSearching}
                    error={searchError}
                  />
                  <Button onClick={handleAddLibrary}>Add</Button>
                </div>

                {/* list */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentDocument.libraries.length === 0 ?
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                          No dependencies added yet. Add one above to get started.
                        </TableCell>
                      </TableRow>
                    : currentDocument.libraries.map((lib) => {
                        const dependency = dependencies.dependencyMap[lib.name];

                        return (
                          <TableRow key={lib.name}>
                            <TableCell className="font-medium">{getPackageNameFromSpec(lib.name)}</TableCell>
                            <TableCell>{dependency?.package?.version || "-"}</TableCell>
                            <TableCell className="max-w-md truncate">
                              {dependency?.package?.description || "-"}
                            </TableCell>
                            <TableCell>
                              {dependency ?
                                <>
                                  {getStatusBadge(dependency.status)}
                                  {dependency.error && (
                                    <span className="ml-2 text-sm text-destructive-foreground">
                                      {dependency.error}
                                    </span>
                                  )}
                                </>
                              : getStatusBadge("loading")}
                            </TableCell>
                            <TableCell>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleRemoveLibrary(lib.name)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    }
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
