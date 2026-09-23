import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Recommender } from "./recommender";
import type { Catalog, RecommendationResponse } from "@/lib/api";

const getCatalog = vi.fn();
const getRecommendations = vi.fn();
const parseIntent = vi.fn();
vi.mock("@/lib/api", () => ({
  getCatalog: () => getCatalog(),
  getRecommendations: (input: unknown) => getRecommendations(input),
  parseIntent: (message: string) => parseIntent(message),
}));

const catalog: Catalog = {
  cities: ["Алматы", "Астана"], categories: ["Ведущий", "Флорист"],
  eventFormats: ["корпоратив", "свадьба"], languages: ["русский"],
  calendar: { from: "2026-09-23", to: "2026-12-31" },
};

const baseResult: RecommendationResponse = {
  status: "matched", count: 1, exactCount: 1, alternativeCount: 0, totalCandidates: 10, eligibleCount: 1,
  message: "Найден 1 подрядчик на 15 октября 2026 года: остальные заняты или не подходят по условиям.",
  analysisMode: "fallback", exclusions: { busy: 2, budget: 3, format: 0, language: 0, duration: 0 },
  items: [{ id: "c-1", name: "Тестовый ведущий", category: "Ведущий", city: "Алматы", priceFromKzt: 300000,
    explanation: "Укладывается в бюджет 900 000 ₸ и свободен 15 октября; работает на корпоративных событиях на русском языке.",
    synthetic: true, city_imputed: true, price_imputed: true, matchType: "exact", alternative: false,
    availableDate: "2026-10-15", matchedFields: ["city", "category", "eventFormat", "date", "budget"], differences: [],
    criteria: [
      { key: "category", label: "Категория", requested: "Ведущий", offered: "Ведущий", status: "matched" },
      { key: "eventFormat", label: "Формат события", requested: "корпоратив", offered: "корпоратив, свадьба", status: "matched" },
      { key: "city", label: "Город", requested: "Алматы", offered: "Алматы", status: "matched" },
      { key: "date", label: "Дата", requested: "15 октября 2026 г.", offered: "Свободен 15 октября 2026 г.", status: "matched" },
      { key: "budget", label: "Бюджет", requested: "до 900 000 ₸", offered: "от 300 000 ₸", status: "matched" },
    ] }],
};

beforeEach(() => {
  getCatalog.mockReset().mockResolvedValue(catalog);
  getRecommendations.mockReset().mockResolvedValue(baseResult);
  parseIntent.mockReset().mockResolvedValue({ values: {}, assumptions: [], missing: [], confidence: 1, analysisMode: "fallback" });
});
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
    const comparison = within(results).getByRole("table", { name: "Сравнение условий для Тестовый ведущий" });
    expect(within(comparison).getByText("Ваш запрос")).toBeInTheDocument();
    expect(within(comparison).getByText("У исполнителя")).toBeInTheDocument();
    expect(within(comparison).getAllByText("Совпадает")).toHaveLength(5);
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

  it("labels alternatives and explains the exact compromise", async () => {
    const user = userEvent.setup();
    getRecommendations.mockResolvedValueOnce({
      ...baseResult,
      status: "no_candidates_after_filters",
      exactCount: 0,
      alternativeCount: 1,
      eligibleCount: 0,
      message: "На выбранную дату точных совпадений нет, но есть близкий вариант.",
      items: [{
        ...baseResult.items[0],
        matchType: "alternative",
        alternative: true,
        availableDate: "2026-10-16",
        differences: [{ field: "date", requested: "2026-10-15", offered: "2026-10-16", message: "На 2026-10-15 исполнитель занят, ближайшая свободная дата — 2026-10-16." }],
        criteria: baseResult.items[0].criteria.map((criterion) => criterion.key === "date"
          ? { ...criterion, offered: "Свободен 16 октября 2026 г.", status: "different" as const }
          : criterion),
      }],
    });
    render(<Recommender />);
    await user.click(await screen.findByRole("button", { name: /Корпоратив · ведущий/ }));
    expect(await screen.findByRole("heading", { name: "Близкие варианты с компромиссом" })).toBeInTheDocument();
    expect(screen.getByText("Близкая альтернатива")).toBeInTheDocument();
    expect(screen.getByText("Что отличается от запроса")).toBeInTheDocument();
    expect(screen.getByText(/ближайшая свободная дата/)).toBeInTheDocument();
    expect(screen.getByText("Есть отличие")).toBeInTheDocument();
  });

  it("blocks invalid form values before requesting", async () => {
    const user = userEvent.setup();
    render(<Recommender />);
    await user.click(await screen.findByRole("button", { name: /Найти подрядчиков/ }));
    expect(await screen.findByText("Выберите город", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("Выберите дату с 23 сентября по 31 декабря 2026 года")).toBeInTheDocument();
    expect(getRecommendations).not.toHaveBeenCalled();
  });

  it("switches to chat, merges recognized values and preserves the form across tabs", async () => {
    const user = userEvent.setup();
    parseIntent.mockResolvedValueOnce({
      values: { eventFormat: "свадьба", budgetKzt: 65000 },
      assumptions: ["Бюджет указан в тенге"],
      missing: ["city", "date", "category"],
      confidence: 0.94,
      analysisMode: "ai",
    });
    render(<Recommender />);

    const date = await screen.findByLabelText("Дата мероприятия *");
    await user.type(date, "2026-10-15");
    await user.click(screen.getByRole("tab", { name: /Чат/ }));
    await user.type(screen.getByLabelText("Описание события"), "хочу свадьбу на 65000 тенге");
    await user.click(screen.getByRole("button", { name: "Заполнить форму" }));

    await waitFor(() => expect(parseIntent).toHaveBeenCalledWith("хочу свадьбу на 65000 тенге"));
    expect(await screen.findByText("Форма обновлена")).toBeInTheDocument();
    expect(screen.getByLabelText("Бюджет, ₸ *")).toHaveValue(65000);
    expect(screen.getByRole("combobox", { name: "Формат мероприятия *" })).toHaveTextContent("свадьба");
    expect(date).toHaveValue("2026-10-15");
    expect(screen.getAllByText("Заполнено AI")).toHaveLength(2);
    expect(getRecommendations).not.toHaveBeenCalled();

    const budget = screen.getByLabelText("Бюджет, ₸ *");
    await user.clear(budget);
    await user.type(budget, "70000");
    expect(screen.getAllByText("Заполнено AI")).toHaveLength(1);
    expect(budget).toHaveValue(70000);

    await user.click(screen.getByRole("tab", { name: "Форма" }));
    expect(date).toHaveValue("2026-10-15");
    expect(screen.getByLabelText("Бюджет, ₸ *")).toHaveValue(70000);
  });

  it("shows parsing errors without changing or submitting the form", async () => {
    const user = userEvent.setup();
    parseIntent.mockRejectedValueOnce(new Error("AI-сервис временно недоступен"));
    render(<Recommender />);
    await user.click(await screen.findByRole("tab", { name: /Чат/ }));
    await user.type(screen.getByLabelText("Описание события"), "свадьба в Алматы");
    await user.click(screen.getByRole("button", { name: "Заполнить форму" }));

    expect(await screen.findByText("Не удалось разобрать описание")).toBeInTheDocument();
    expect(screen.getByText("AI-сервис временно недоступен")).toBeInTheDocument();
    expect(getRecommendations).not.toHaveBeenCalled();
  });

  it("disables chat submission for an empty prompt and while parsing", async () => {
    const user = userEvent.setup();
    let finish: ((value: unknown) => void) | undefined;
    parseIntent.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    render(<Recommender />);
    await user.click(await screen.findByRole("tab", { name: /Чат/ }));

    const submit = screen.getByRole("button", { name: "Заполнить форму" });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText("Описание события"), "нужен ведущий");
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(screen.getByRole("button", { name: "Разбираем запрос" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Выделяем параметры");

    finish?.({ values: {}, assumptions: [], missing: ["city"], confidence: 0.2, analysisMode: "fallback" });
    expect(await screen.findByText("Нужны дополнительные детали")).toBeInTheDocument();
  });
});
