import { searchNpmPackages } from "./npmSearch";

const createPackageMetadata = (name: string) => ({
  _id: name,
  name,
  description: `${name} description`,
  "dist-tags": { latest: "20.0.0" },
  versions: {
    "21.0.0": { name, version: "21.0.0" },
    "20.1.0": { name, version: "20.1.0" },
    "20.0.0": { name, version: "20.0.0" },
  },
});

const createSearchResponse = (name: string) => ({
  objects: [
    {
      package: {
        name,
        version: "20.0.0",
        description: `${name} description`,
      },
      score: {
        final: 1,
        detail: { popularity: 1, quality: 1, maintenance: 1 },
      },
    },
  ],
  total: 1,
});

const getRequestUrl = (input: Request | URL | string) => {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
};

const stubRegistry = (responses: Map<string, unknown>) => {
  const requestedUrls: string[] = [];
  vi.stubGlobal("fetch", async (input: Request | URL | string) => {
    const url = getRequestUrl(input);
    requestedUrls.push(url);
    if (!responses.has(url)) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(responses.get(url)), {
      headers: { "content-type": "application/json" },
    });
  });
  return requestedUrls;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("searchNpmPackages", () => {
  it("lists versions for a scoped package ending in a version separator", async () => {
    const metadataUrl = "https://registry.npmjs.org/%40types%2Fnode";
    const requestedUrls = stubRegistry(new Map([[metadataUrl, createPackageMetadata("@types/node")]]));

    const suggestions = await searchNpmPackages("@types/node@");

    expect(requestedUrls).toEqual([metadataUrl]);
    expect(suggestions.map(({ label, name }) => ({ label, name }))).toEqual([
      { label: "20.0.0", name: "@types/node@20.0.0" },
      { label: "21.0.0", name: "@types/node@21.0.0" },
      { label: "20.1.0", name: "@types/node@20.1.0" },
    ]);
  });

  it("resolves a scoped package version range", async () => {
    const metadataUrl = "https://registry.npmjs.org/%40types%2Fnode";
    const versionUrl = `${metadataUrl}/20.1.0`;
    const requestedUrls = stubRegistry(
      new Map<string, unknown>([
        [metadataUrl, createPackageMetadata("@types/node")],
        [
          versionUrl,
          {
            name: "@types/node",
            version: "20.1.0",
            description: "@types/node description",
          },
        ],
      ]),
    );

    const suggestions = await searchNpmPackages("@types/node@20");

    expect(requestedUrls).toEqual([metadataUrl, versionUrl]);
    expect(suggestions).toEqual([
      expect.objectContaining({
        label: "@types/node@20.1.0",
        name: "@types/node@20.1.0",
        packageName: "@types/node",
        version: "20.1.0",
      }),
    ]);
  });

  it("preserves unscoped package version lookup", async () => {
    const metadataUrl = "https://registry.npmjs.org/lodash";
    const requestedUrls = stubRegistry(new Map([[metadataUrl, createPackageMetadata("lodash")]]));

    const suggestions = await searchNpmPackages("lodash@");

    expect(requestedUrls).toEqual([metadataUrl]);
    expect(suggestions[0]).toEqual(
      expect.objectContaining({
        label: "20.0.0",
        name: "lodash@20.0.0",
      }),
    );
  });

  it("reports a version metadata HTTP failure", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        new Response(null, {
          status: 500,
          statusText: "Internal Server Error",
        }),
      ),
    );

    await expect(searchNpmPackages("lodash@")).rejects.toThrow(
      "Failed to fetch npm package versions: npm registry version lookup failed: Internal Server Error",
    );
  });

  it("reports a version metadata network failure", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("network unavailable")));

    await expect(searchNpmPackages("lodash@")).rejects.toThrow(
      "Failed to fetch npm package versions: network unavailable",
    );
  });

  it("reports malformed version metadata", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(new Response("{", { headers: { "content-type": "application/json" } })),
    );

    await expect(searchNpmPackages("lodash@")).rejects.toThrow(/^Failed to fetch npm package versions:/);
  });

  it("returns no versions when a version lookup is aborted", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new DOMException("The operation was aborted", "AbortError")));

    await expect(searchNpmPackages("lodash@")).resolves.toEqual([]);
  });

  it("returns no versions for valid metadata with no versions", async () => {
    const metadataUrl = "https://registry.npmjs.org/lodash";
    const requestedUrls = stubRegistry(
      new Map([
        [
          metadataUrl,
          {
            ...createPackageMetadata("lodash"),
            "dist-tags": {},
            versions: {},
          },
        ],
      ]),
    );

    await expect(searchNpmPackages("lodash@")).resolves.toEqual([]);
    expect(requestedUrls).toEqual([metadataUrl]);
  });

  it("keeps an unversioned scoped package on text search", async () => {
    const searchUrl = "https://registry.npmjs.org/-/v1/search?text=%40types%2Fnode&size=10";
    const requestedUrls = stubRegistry(new Map([[searchUrl, createSearchResponse("@types/node")]]));

    const suggestions = await searchNpmPackages("@types/node");

    expect(requestedUrls).toEqual([searchUrl]);
    expect(suggestions).toEqual([
      expect.objectContaining({
        label: "@types/node",
        name: "@types/node",
        packageName: "@types/node",
      }),
    ]);
  });
});
