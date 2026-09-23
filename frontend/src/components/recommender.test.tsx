import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Recommender } from "./recommender";
import type { Catalog, RecommendationResponse } from "@/lib/api";

const getCatalog = vi.fn();
const getRecommendations = vi.fn();
vi.mock("@/lib/api", () => ({ getCatalog: () => getCatalog(), getRecommendations: (input: unknown) => getRecommendations(input) }));

const catalog: Catalog = {
  cities: ["Алматы", "Астана"], categories: ["Ведущий", "Флорист"],
  eventFormats: ["корпоратив"], languages: ["русский"],
  calendar: { from: "2026-09-23", to: "2026-12-31" },
};

const baseResult: RecommendationResponse = {
  status: "matched", count: 1, totalCandidates: 10, eligibleCount: 1,
  message: "Найден 1 подрядчик на 15 октября 2026 года: остальные заняты или не подходят по условиям.",
  analysisMode: "fallback", exclusions: { busy: 2, budget: 3, format: 0, language: 0, duration: 0 },
  items: [{ id: "c-1", name: "Тестовый ведущий", category: "Ведущий", city: "Алматы", priceFromKzt: 300000,
    explanation: "Укладывается в бюджет 900 000 ₸ и свободен 15 октября; работает на корпоративных событиях на русском языке.",
    synthetic: true, city_imputed: true, price_imputed: true }],
};

beforeEach(() => { getCatalog.mockReset().mockResolvedValue(catalog); getRecommendations.mockReset().mockResolvedValue(baseResult); });
afterEach(() => cleanup());

describe("recommender", () => {
  it("sends the dense preset with exact contract fields and shows provenance flags", async () => {
    const user = userEvent.setup();
    render(<Recommender />);
    await user.click(await screen.findByRole("button", { name: /Корпоратив · ведущий/ }));
    await waitFor(() => expect(getRecommendations).toHaveBeenCalledWith({ city: "Алматы", date: "2026-10-15", eventFormat: "корпоратив", category: "Ведущий", budgetKzt: 900000, language: "русский" }));
    const results = await screen.findByRole("region", { name: "Подходящие подрядчики" });
    expect(within(results).getByText(baseResult.message)).toBeInTheDocument();
    expect(within(results).getByText("Синтетический профиль")).toBeInTheDocument();
    expect(within(results).getByText("Город добавлен при подготовке")).toBeInTheDocument();
    expect(within(results).getByText("Цена добавлена при подготовке")).toBeInTheDocument();
    expect(within(results).getByText("Резервный алгоритм")).toBeInTheDocument();
  });

  it("distinguishes no category from candidates excluded by conditions", async () => {
    const user = userEvent.setup();
    getRecommendations.mockResolvedValueOnce({ ...baseResult, status: "no_category_in_city", count: 0, totalCandidates: 0, eligibleCount: 0, items: [], message: "В Астане нет категории Инструменталист." })
      .mockResolvedValueOnce({ ...baseResult, status: "no_candidates_after_filters", count: 0, eligibleCount: 0, items: [], message: "На 15 октября все 10 кандидатов исключены условиями." });
    render(<Recommender />);
    await user.click(await screen.findByRole("button", { name: /Корпоратив · флорист/ }));
    expect(await screen.findByRole("heading", { name: "В городе нет этой категории" })).toBeInTheDocument();
    expect(screen.getByText("В Астане нет категории Инструменталист.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Бюджет без совпадений/ }));
    expect(await screen.findByRole("heading", { name: "Кандидаты есть, но условия не подошли" })).toBeInTheDocument();
    expect(screen.getByText("На 15 октября все 10 кандидатов исключены условиями.")).toBeInTheDocument();
  });

  it("blocks invalid form values before requesting", async () => {
    const user = userEvent.setup();
    render(<Recommender />);
    await user.click(await screen.findByRole("button", { name: /Найти подрядчиков/ }));
    expect(await screen.findByText("Выберите город", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("Выберите дату с 23 сентября по 31 декабря 2026 года")).toBeInTheDocument();
    expect(getRecommendations).not.toHaveBeenCalled();
  });
});
