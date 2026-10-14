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

  it.each([
    ["demo-package", "999.0.0"],
    ["demo-package", "^999"],
    ["demo-package", "1.2."],
    ["a", "999.0.0"],
  ])("returns no substitute for %s@%s", async (packageName, versionSpec) => {
    const query = `${packageName}@${versionSpec}`;
    const metadataUrl = `https://registry.npmjs.org/${packageName}`;
    const version = { name: packageName, version: "1.2.3" };
    const requestedUrls = stubRegistry(
      new Map<string, unknown>([
        [metadataUrl, {
          _id: packageName,
          name: packageName,
          "dist-tags": { latest: "1.2.3" },
          versions: { "1.2.3": version },
        }],
        [`${metadataUrl}/1.2.3`, version],
        [
          `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=10`,
          createSearchResponse("unrelated-package"),
        ],
      ]),
    );

    await expect(searchNpmPackages(query)).resolves.toEqual([]);
    expect(requestedUrls).toEqual([metadataUrl]);
  });

  it("returns no version for latest when that tag is absent", async () => {
    const metadataUrl = "https://registry.npmjs.org/demo-package";
    const requestedUrls = stubRegistry(new Map<string, unknown>([
      [metadataUrl, { ...createPackageMetadata("demo-package"), "dist-tags": {} }],
      [`${metadataUrl}/20.0.0`, { name: "demo-package", version: "20.0.0" }],
    ]));

    await expect(searchNpmPackages("demo-package@latest")).resolves.toEqual([]);
    expect(requestedUrls).toEqual([metadataUrl]);
  });

  it.each([
    ["20.0.0", "20.0.0"],
    ["latest", "20.0.0"],
    ["^20", "20.1.0"],
  ])("resolves %s to the matching published version %s", async (versionSpec, version) => {
    const metadataUrl = "https://registry.npmjs.org/demo-package";
    const requestedUrls = stubRegistry(new Map<string, unknown>([
      [metadataUrl, createPackageMetadata("demo-package")],
      [`${metadataUrl}/${version}`, { name: "demo-package", version }],
    ]));

    await expect(searchNpmPackages(`demo-package@${versionSpec}`)).resolves.toEqual([
      expect.objectContaining({
        name: `demo-package@${version}`,
        packageName: "demo-package",
        version,
        label: `demo-package@${version}`,
      }),
    ]);
    expect(requestedUrls).toEqual([metadataUrl, `${metadataUrl}/${version}`]);
  });

  it("reports a qualified metadata HTTP failure without switching to text search", async () => {
    const requestedUrls = stubRegistry(new Map([
      [
        "https://registry.npmjs.org/-/v1/search?text=demo-package%40999.0.0&size=10",
        createSearchResponse("unrelated-package"),
      ],
    ]));

    await expect(searchNpmPackages("demo-package@999.0.0")).rejects.toThrow(
      "Failed to resolve npm package version: npm registry metadata lookup failed: HTTP 404",
    );
    expect(requestedUrls).toEqual(["https://registry.npmjs.org/demo-package"]);
  });

  it("reports a resolved version HTTP failure without switching to text search", async () => {
    const metadataUrl = "https://registry.npmjs.org/demo-package";
    const requestedUrls = stubRegistry(new Map<string, unknown>([
      [metadataUrl, createPackageMetadata("demo-package")],
      [
        "https://registry.npmjs.org/-/v1/search?text=demo-package%40latest&size=10",
        createSearchResponse("unrelated-package"),
      ],
    ]));

    await expect(searchNpmPackages("demo-package@latest")).rejects.toThrow(
      "Failed to resolve npm package version: npm registry resolved version lookup failed: HTTP 404",
    );
    expect(requestedUrls).toEqual([metadataUrl, `${metadataUrl}/20.0.0`]);
  });

  it("reports malformed metadata for a qualified query", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("{")));

    await expect(searchNpmPackages("demo-package@1")).rejects.toThrow(
      /^Failed to resolve npm package version:/,
    );
  });

  it("passes cancellation to a qualified lookup and returns no suggestions", async () => {
    vi.stubGlobal("fetch", (_input: Request | URL | string, options?: RequestInit) => {
      const signal = options?.signal;
      assert(signal, "Expected the lookup's abort signal");

      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason));
      });
    });

    const controller = new AbortController();
    const suggestions = searchNpmPackages("demo-package@1", 10, controller.signal);
    controller.abort();

    await expect(suggestions).resolves.toEqual([]);
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
