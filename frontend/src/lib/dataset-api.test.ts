import { afterEach, describe, expect, it, vi } from "vitest";
import { getDataset } from "./dataset-api";

afterEach(() => vi.unstubAllGlobals());

describe("dataset API", () => {
  it("encodes supported filters and pagination", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [], total: 0, page: 2, limit: 12, totalPages: 1 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await getDataset({ city: "Алматы", category: "Банкетный зал", profileType: "real", search: "зал", page: 2, limit: 12 });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain("/dataset/api?");
    const params = new URL(url, "http://localhost").searchParams;
    expect(Object.fromEntries(params)).toEqual({ city: "Алматы", category: "Банкетный зал", profileType: "real", search: "зал", page: "2", limit: "12" });
    expect(options).toEqual({ cache: "no-store" });
  });
});
