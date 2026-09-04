import { cache } from "./cache";

const CACHE_KEY_PREFIX = "v2:";

export const cachedFetch = async (url: RequestInfo | URL, opts?: RequestInit) => {
  const path = url.toString();
  const cacheKey = `${CACHE_KEY_PREFIX}${path}`;
  const cached = await cache.get(cacheKey);
  if (cached) {
    return new Response(cached, { headers: { "Content-Type": "text/javascript" } });
  }
  const response = await fetch(url, opts);
  if (!response.ok) return response;
  const clone = response.clone();
  const content = await clone.text();
  await cache.set(cacheKey, content);
  return response;
};
