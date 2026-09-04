import * as semver from "semver";
import { parsePackageSpec } from "@/services/dependencies/DependencyService";

export interface PackageSuggestion {
  name: string;
  packageName: string;
  version: string;
  label: string;
  description?: string;
  monthlyDownloads?: number;
  license?: string;
}

interface NpmSearchResponse {
  objects: {
    package: {
      name: string;
      version: string;
      description?: string;
      keywords?: string[];
      license?: string;
    };
    score: {
      final: number;
      detail: {
        popularity: number;
        quality: number;
        maintenance: number;
      };
    };
  }[];
  total: number;
}

interface NpmPackageMetadata {
  _id: string;
  name: string;
  description?: string;
  "dist-tags": {
    latest: string;
    [key: string]: string;
  };
  versions: Record<
    string,
    {
      name: string;
      version: string;
      description?: string;
      license?: string;
      licenses?: { type: string; url: string }[];
      [key: string]: unknown;
    }
  >;
  license?: string;
  licenses?: { type: string; url: string }[];
}

interface NpmPackageVersion {
  name: string;
  version: string;
  description?: string;
  license?: string;
  licenses?: { type: string; url: string }[];
  [key: string]: unknown;
}

function extractLicense(packageData: NpmPackageMetadata | NpmPackageVersion): string | undefined {
  if (typeof packageData.license === "string") {
    return packageData.license;
  }
  if (packageData.licenses && Array.isArray(packageData.licenses) && packageData.licenses.length > 0) {
    return packageData.licenses[0].type;
  }
  return undefined;
}

async function fetchPackageVersions(packageName: string, signal?: AbortSignal): Promise<PackageSuggestion[]> {
  try {
    const packageResponse = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`, {
      signal,
    });
    if (!packageResponse.ok) {
      const responseFailure = packageResponse.statusText || `HTTP ${packageResponse.status}`;
      throw new Error(`npm registry version lookup failed: ${responseFailure}`);
    }

    const packageData: NpmPackageMetadata = await packageResponse.json();
    const versions = packageData.versions || {};
    const distTags = packageData["dist-tags"] || {};
    const latestVersion = distTags.latest;

    const versionStrings = Object.keys(versions).sort((a, b) => {
      try {
        return semver.compare(b, a);
      } catch {
        return b.localeCompare(a);
      }
    });

    if (latestVersion && versionStrings.includes(latestVersion)) {
      const latestIndex = versionStrings.indexOf(latestVersion);
      versionStrings.splice(latestIndex, 1);
      versionStrings.unshift(latestVersion);
    }

    const packageLicense = extractLicense(packageData);

    return versionStrings.map((versionString) => {
      const versionData = versions[versionString];
      return {
        name: `${packageName}@${versionString}`,
        packageName: packageData.name,
        version: versionString,
        label: versionString,
        description: versionData.description || packageData.description,
        license: extractLicense(versionData) || packageLicense,
      };
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return [];
    }
    throw new Error(
      `Failed to fetch npm package versions: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

const performRegularSearch = async (
  query: string,
  limit: number,
  signal?: AbortSignal,
): Promise<PackageSuggestion[]> => {
  const searchQuery = encodeURIComponent(query);
  const url = `https://registry.npmjs.org/-/v1/search?text=${searchQuery}&size=${limit}`;

  try {
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`npm registry search failed: ${response.statusText}`);
    }

    const data: NpmSearchResponse = await response.json();

    return data.objects.map((obj) => ({
      name: obj.package.name,
      packageName: obj.package.name,
      version: obj.package.version,
      label: obj.package.name,
      description: obj.package.description,
      license: obj.package.license,
    }));
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return [];
    }
    throw new Error(
      `Failed to search npm packages: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export async function searchNpmPackages(
  query: string,
  limit = 10,
  signal?: AbortSignal,
): Promise<PackageSuggestion[]> {
  if (!query || query.trim().length < 2) {
    return [];
  }

  const trimmedQuery = query.trim();
  const { packageName: parsedPackageName, versionSpec: parsedVersionSpec } = parsePackageSpec(trimmedQuery);
  const packageName = parsedPackageName.trim();
  const versionSpec = parsedVersionSpec?.trim() ?? null;

  if (versionSpec === "" && packageName.length >= 2) {
    return fetchPackageVersions(packageName, signal);
  }

  if (versionSpec !== null && packageName.length >= 2 && versionSpec.length > 0) {
    try {
      const packageResponse = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`, {
        signal,
      });
      if (!packageResponse.ok) {
        return await performRegularSearch(trimmedQuery, limit, signal);
      }

      const packageData: NpmPackageMetadata = await packageResponse.json();
      const versions = packageData.versions || {};
      const distTags = packageData["dist-tags"] || {};

      let resolvedVersion: string | null = null;

      if (versionSpec === "latest") {
        resolvedVersion = distTags.latest || Object.keys(versions).pop() || null;
      } else if (distTags[versionSpec]) {
        resolvedVersion = distTags[versionSpec];
      } else if (versions[versionSpec]) {
        resolvedVersion = versionSpec;
      } else {
        const versionKeys = Object.keys(versions).sort((a, b) => {
          try {
            return semver.compare(b, a);
          } catch {
            return b.localeCompare(a);
          }
        });

        resolvedVersion =
          semver.maxSatisfying(versionKeys, versionSpec) ||
          versionKeys.find((v) => v.startsWith(versionSpec)) ||
          versionKeys[0] ||
          null;
      }

      if (!resolvedVersion || !versions[resolvedVersion]) {
        return await performRegularSearch(trimmedQuery, limit, signal);
      }

      const versionResponse = await fetch(
        `https://registry.npmjs.org/${encodeURIComponent(packageName)}/${encodeURIComponent(resolvedVersion)}`,
        { signal },
      );
      if (!versionResponse.ok) {
        return await performRegularSearch(trimmedQuery, limit, signal);
      }

      const versionData: NpmPackageVersion = await versionResponse.json();
      const resolvedPackageSpec = `${packageName}@${resolvedVersion}`;

      return [
        {
          name: resolvedPackageSpec,
          packageName: versionData.name,
          version: resolvedVersion,
          label: resolvedPackageSpec,
          description: versionData.description,
          license: extractLicense(versionData),
        },
      ];
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return [];
      }
      return performRegularSearch(trimmedQuery, limit, signal);
    }
  }

  return performRegularSearch(trimmedQuery, limit, signal);
}
