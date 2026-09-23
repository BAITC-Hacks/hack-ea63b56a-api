import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "./providers";
import { DatasetExplorer } from "./dataset-explorer";

const getDataset = vi.fn();
const getDatasetCatalog = vi.fn();
vi.mock("@/lib/dataset-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/dataset-api")>("@/lib/dataset-api");
  return { ...actual, getDataset: (query: unknown) => getDataset(query), getDatasetCatalog: () => getDatasetCatalog() };
});

const profile = {
  id: "HK-1", name: "Тестовый ведущий", categories: ["Ведущий"], city: "Алматы",
  cityImputed: false, profileType: "synthetic" as const, isSynthetic: true,
  priceFromKzt: 250000, priceImputed: false, eventFormats: ["свадьба"],
  languages: ["русский"], maxHours: 6, busyDates: [], description: "Проводит камерные свадьбы.",
};

beforeEach(() => {
  getDataset.mockReset().mockResolvedValue({ items: [profile], total: 1, page: 1, limit: 12, totalPages: 1 });
  getDatasetCatalog.mockReset().mockResolvedValue({ cities: ["Алматы"], categories: ["Ведущий"], eventFormats: ["свадьба"], languages: ["русский"], calendar: { from: "2026-09-23", to: "2026-12-31" } });
});
afterEach(() => cleanup());

describe("dataset explorer", () => {
  it("shows provenance and applies a text search", async () => {
    const user = userEvent.setup();
    render(<Providers><DatasetExplorer /></Providers>);
    expect((await screen.findAllByText("Синтетический профиль")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Тестовый ведущий").length).toBeGreaterThan(0);

    await user.type(screen.getByLabelText("Поиск"), "свадьба");
    await user.click(screen.getByRole("button", { name: "Найти" }));
    await waitFor(() => expect(getDataset).toHaveBeenLastCalledWith(expect.objectContaining({ search: "свадьба", page: 1, limit: 12 })));
  });

  it("renders an actionable empty state", async () => {
    getDataset.mockResolvedValueOnce({ items: [], total: 0, page: 1, limit: 12, totalPages: 1 });
    render(<Providers><DatasetExplorer /></Providers>);
    expect(await screen.findByRole("heading", { name: "Профили не найдены" })).toBeInTheDocument();
    expect(screen.getByText("Измените поиск или снимите часть фильтров.")).toBeInTheDocument();
  });
});
