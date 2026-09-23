import { expect, test } from "@playwright/test";

test("fills a demo request and explains a result", async ({ page }) => {
  await page.route("**/api/v1/catalog", (route) => route.fulfill({ json: {
    cities: ["Алматы", "Астана"], categories: ["Ведущий", "Флорист"], eventFormats: ["корпоратив"], languages: ["русский"], calendar: { from: "2026-09-23", to: "2026-12-31" },
  } }));
  await page.route("**/api/v1/recommendations", (route) => route.fulfill({ json: {
    status: "matched", count: 1, totalCandidates: 10, eligibleCount: 1,
    message: "Найден 1 подрядчик на 15 октября: остальные не подходят по условиям.", analysisMode: "fallback",
    exclusions: { busy: 2, budget: 3, format: 0, language: 0, duration: 0 },
    items: [{ id: "c-1", name: "Ведущий тест", category: "Ведущий", city: "Алматы", priceFromKzt: 300000,
      explanation: "Свободен 15 октября, подходит для корпоратива на русском языке и укладывается в бюджет.", synthetic: false, city_imputed: false, price_imputed: false }],
  } }));
  await page.goto("/");
  await page.getByRole("button", { name: /Корпоратив · ведущий/ }).click();
  await expect(page.getByRole("heading", { name: "Подходящие подрядчики" })).toBeVisible();
  await expect(page.getByText("Ведущий тест")).toBeVisible();
  await expect(page.getByText("Реальный профиль (анонимизирован)")).toBeVisible();
});
