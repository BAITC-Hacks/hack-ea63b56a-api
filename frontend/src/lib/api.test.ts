import { afterEach, describe, expect, it, vi } from "vitest";
import { getRecommendations, parseIntent } from "./api";

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
    expect(result).toMatchObject({ exactCount: 1, alternativeCount: 0 });
    expect(result.items[0]).toMatchObject({
      category: "Ведущий, Ведущий церемонии", city_imputed: true, price_imputed: false,
      matchType: "exact", alternative: false, availableDate: input.date, differences: [],
    });
    expect(result.items[0].criteria).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "category", requested: "Ведущий", status: "matched" }),
      expect.objectContaining({ key: "budget", requested: expect.stringContaining("900"), status: "matched" }),
    ]));
  });
});

describe("intent API", () => {
  it("posts only the natural-language message to the backend", async () => {
    const parsed = {
      values: { eventFormat: "свадьба", budgetKzt: 65000 },
      assumptions: [],
      missing: ["city", "date", "category"],
      confidence: 0.91,
      analysisMode: "ai",
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => parsed });
    vi.stubGlobal("fetch", fetchMock);

    await expect(parseIntent("хочу свадьбу на 65000 тенге")).resolves.toEqual(parsed);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/api\/v1\/intake\/parse$/), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "хочу свадьбу на 65000 тенге" }),
    });
  });
});
