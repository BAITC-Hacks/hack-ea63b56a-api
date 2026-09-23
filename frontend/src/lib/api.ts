export type Catalog = {
  cities: string[];
  categories: string[];
  eventFormats: string[];
  languages: string[];
  calendar: { from: string; to: string };
};

export type RecommendationRequest = {
  city: string;
  date: string;
  eventFormat: string;
  category: string;
  budgetKzt: number;
  language?: string;
  durationHours?: number;
};

export type RecommendationResponse = {
  status: "matched" | "no_category_in_city" | "no_candidates_after_filters";
  count: number;
  totalCandidates: number;
  eligibleCount: number;
  message: string;
  analysisMode: "ai" | "fallback" | "not_needed";
  exclusions: { busy: number; budget: number; format: number; language: number; duration: number };
  items: {
    id: string;
    name: string;
    category: string;
    city: string;
    priceFromKzt: number;
    explanation: string;
    synthetic: boolean;
    city_imputed: boolean;
    price_imputed: boolean;
  }[];
};

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body.message === "string" ? body.message :
      body && Array.isArray(body.message) ? `Проверьте параметры: ${body.message.join("; ")}` :
      "Сервис временно недоступен. Попробуйте ещё раз.";
    throw new Error(message);
  }
  return body as T;
}

export async function getCatalog(): Promise<Catalog> {
  return readJson<Catalog>(await fetch("/api/v1/catalog", { cache: "no-store" }));
}

export async function getRecommendations(input: RecommendationRequest): Promise<RecommendationResponse> {
  return readJson<RecommendationResponse>(await fetch("/api/v1/recommendations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }));
}
