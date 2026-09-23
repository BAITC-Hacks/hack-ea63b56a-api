import { afterEach, describe, expect, it, vi } from "vitest";
import { getRecommendations } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("recommendations API", () => {
  it("normalizes category and provenance flags at the API boundary", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "matched",
        count: 1,
        totalCandidates: 1,
        eligibleCount: 1,
        message: "Найден 1 подрядчик.",
        analysisMode: "ai",
        exclusions: { busy: 0, budget: 0, format: 0, language: 0, duration: 0 },
        items: [{ id: "c-1", name: "Ведущий", categories: ["Ведущий", "Ведущий церемонии"], city: "Алматы", priceFromKzt: 300000,
          explanation: "Проводит корпоративы на русском языке.", synthetic: true, cityImputed: true, priceImputed: false }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const input = { city: "Алматы", date: "2026-10-15", eventFormat: "корпоратив", category: "Ведущий", budgetKzt: 900000 };
    const result = await getRecommendations(input);

    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/api\/v1\/recommendations$/), expect.objectContaining({ method: "POST" }));
    expect(result.items[0]).toMatchObject({ category: "Ведущий, Ведущий церемонии", city_imputed: true, price_imputed: false });
  });
});
