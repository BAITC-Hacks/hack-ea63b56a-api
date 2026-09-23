import type { Catalog } from "@/lib/api";

export type DatasetProfileType = "real" | "synthetic";

export type DatasetContractor = {
  id: string;
  name: string;
  categories: string[];
  city: string;
  cityImputed: boolean;
  profileType: DatasetProfileType;
  isSynthetic: boolean;
  priceFromKzt: number;
  priceImputed: boolean;
  eventFormats: string[];
  languages: string[];
  maxHours: number | null;
  busyDates: string[];
  description: string;
};

export type DatasetResponse = {
  items: DatasetContractor[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type DatasetQuery = {
  city?: string;
  category?: string;
  profileType?: DatasetProfileType;
  search?: string;
  page?: number;
  limit?: number;
};

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body.message === "string"
      ? body.message
      : "Не удалось загрузить датасет. Попробуйте ещё раз.";
    throw new Error(message);
  }
  return body as T;
}

export async function getDataset(query: DatasetQuery): Promise<DatasetResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return readJson<DatasetResponse>(await fetch(`/dataset/api?${params.toString()}`, { cache: "no-store" }));
}

export async function getDatasetCatalog(): Promise<Catalog> {
  return readJson<Catalog>(await fetch("/api/v1/catalog", { cache: "no-store" }));
}
