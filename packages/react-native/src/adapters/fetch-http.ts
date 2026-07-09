import type { HttpClient } from "../ports/http.js";

/** Works on React Native and Node ≥18 — both provide global fetch. */
export function fetchHttpClient(fetchImpl: typeof fetch = fetch): HttpClient {
  const get = async (url: string): Promise<Response | null> => {
    const response = await fetchImpl(url, {
      headers: { "cache-control": "no-cache" },
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`GET ${url} -> ${response.status}`);
    return response;
  };
  return {
    getText: async (url) => {
      const response = await get(url);
      return response === null ? null : response.text();
    },
    getBytes: async (url) => {
      const response = await get(url);
      if (response === null) throw new Error(`GET ${url} -> 404`);
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}
