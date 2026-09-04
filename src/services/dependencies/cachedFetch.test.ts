import { cache } from "./cache";
import { cachedFetch } from "./cachedFetch";

let cachedEntries: Map<string, string>;

beforeEach(() => {
  cachedEntries = new Map();
  vi.spyOn(cache, "get").mockImplementation(async (key) => cachedEntries.get(key));
  vi.spyOn(cache, "set").mockImplementation(async (key, value) => {
    cachedEntries.set(key, value);
    return undefined;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("cachedFetch", () => {
  it("bypasses cache entries written before successful responses were enforced", async () => {
    const url = "https://example.test/package.json";
    cachedEntries.set(url, "legacy failed response");
    const fetchRequest = vi.fn(async () => new Response("current response"));
    vi.stubGlobal("fetch", fetchRequest);

    const firstResponse = await cachedFetch(url);
    const secondResponse = await cachedFetch(url);

    expect(await firstResponse.text()).toBe("current response");
    expect(await secondResponse.text()).toBe("current response");
    expect(fetchRequest).toHaveBeenCalledTimes(1);
  });

  it("does not cache or replay a failed response as successful", async () => {
    const fetchRequest = vi.fn(
      async () => new Response("not found", { status: 404, statusText: "Not Found" }),
    );
    vi.stubGlobal("fetch", fetchRequest);

    const url = "https://example.test/package.json";
    const firstResponse = await cachedFetch(url);
    const secondResponse = await cachedFetch(url);

    expect(firstResponse.ok).toBe(false);
    expect(secondResponse.ok).toBe(false);
    expect(fetchRequest).toHaveBeenCalledTimes(2);
    expect(cache.set).not.toHaveBeenCalled();
  });
});
