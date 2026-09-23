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

export type IntentValues = Partial<RecommendationRequest>;

export type IntentParseResponse = {
  values: IntentValues;
  assumptions: string[];
  missing: (keyof RecommendationRequest)[];
  confidence: number;
  analysisMode: "ai" | "fallback";
};

export type RecommendationResponse = {
  status: "matched" | "no_category_in_city" | "no_candidates_after_filters";
  count: number;
  exactCount: number;
  alternativeCount: number;
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
    matchType: "exact" | "alternative";
    alternative: boolean;
    availableDate: string;
    matchedFields: string[];
    differences: {
      field: "date" | "budget" | "language" | "duration";
      requested: string | number;
      offered: string | number;
      message: string;
    }[];
    criteria: {
      key: "city" | "category" | "eventFormat" | "date" | "budget" | "language" | "duration";
      label: string;
      requested: string;
      offered: string;
      status: "matched" | "different";
    }[];
  }[];
};

type RecommendationWireItem = Omit<RecommendationResponse["items"][number], "category" | "city_imputed" | "price_imputed" | "matchType" | "alternative" | "availableDate" | "matchedFields" | "differences" | "criteria"> & {
  category?: string;
  categories?: string[] | string;
  city_imputed?: boolean;
  price_imputed?: boolean;
  cityImputed?: boolean;
  priceImputed?: boolean;
  matchType?: "exact" | "alternative";
  alternative?: boolean;
  availableDate?: string;
  matchedFields?: string[];
  differences?: RecommendationResponse["items"][number]["differences"];
  criteria?: RecommendationResponse["items"][number]["criteria"];
};

type RecommendationWireResponse = Omit<RecommendationResponse, "items" | "exactCount" | "alternativeCount"> & {
  exactCount?: number;
  alternativeCount?: number;
  items: RecommendationWireItem[];
};

const apiBase = (process.env.NEXT_PUBLIC_API_URL?.trim() || "/api/v1").replace(/\/+$/, "");
const comparisonMoney = new Intl.NumberFormat("ru-RU");
const comparisonDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function fallbackCriteria(
  input: RecommendationRequest,
  item: RecommendationWireItem,
  category: string,
  matchType: "exact" | "alternative",
) {
  const different = new Set(item.differences?.map((difference) => difference.field) ?? []);
  const availableDate = item.availableDate ?? input.date;
  const criteria: RecommendationResponse["items"][number]["criteria"] = [
    { key: "category", label: "Категория", requested: input.category, offered: category, status: "matched" },
    { key: "eventFormat", label: "Формат события", requested: input.eventFormat, offered: input.eventFormat, status: "matched" },
    { key: "city", label: "Город", requested: input.city, offered: item.city, status: "matched" },
    { key: "date", label: "Дата", requested: comparisonDate.format(new Date(`${input.date}T00:00:00Z`)), offered: `Свободен ${comparisonDate.format(new Date(`${availableDate}T00:00:00Z`))}`, status: different.has("date") || matchType === "alternative" && availableDate !== input.date ? "different" : "matched" },
    { key: "budget", label: "Бюджет", requested: `до ${comparisonMoney.format(input.budgetKzt)} ₸`, offered: `от ${comparisonMoney.format(item.priceFromKzt)} ₸`, status: different.has("budget") ? "different" : "matched" },
  ];
  if (input.language) criteria.push({ key: "language", label: "Язык", requested: input.language, offered: input.language, status: different.has("language") ? "different" : "matched" });
  if (input.durationHours !== undefined) criteria.push({ key: "duration", label: "Длительность", requested: `${input.durationHours} ч`, offered: different.has("duration") ? "См. отличие выше" : `${input.durationHours} ч`, status: different.has("duration") ? "different" : "matched" });
  return criteria;
}

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
  return readJson<Catalog>(await fetch(`${apiBase}/catalog`, { cache: "no-store" }));
}

export async function getRecommendations(input: RecommendationRequest): Promise<RecommendationResponse> {
  const response = await readJson<RecommendationWireResponse>(await fetch(`${apiBase}/recommendations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }));
  const items = response.items.map((item) => {
    const matchType = item.matchType ?? (item.alternative ? "alternative" : "exact");
    const category = item.category ?? (Array.isArray(item.categories) ? item.categories.join(", ") : item.categories ?? input.category);
    return {
      ...item,
      category,
      city_imputed: item.city_imputed ?? item.cityImputed ?? false,
      price_imputed: item.price_imputed ?? item.priceImputed ?? false,
      matchType,
      alternative: item.alternative ?? matchType === "alternative",
      availableDate: item.availableDate ?? input.date,
      matchedFields: item.matchedFields ?? [],
      differences: item.differences ?? [],
      criteria: item.criteria ?? fallbackCriteria(input, item, category, matchType),
    };
  });
  return {
    ...response,
    exactCount: response.exactCount ?? items.filter((item) => item.matchType === "exact").length,
    alternativeCount: response.alternativeCount ?? items.filter((item) => item.matchType === "alternative").length,
    items,
  };
}

export async function parseIntent(message: string): Promise<IntentParseResponse> {
  return readJson<IntentParseResponse>(await fetch(`${apiBase}/intake/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  }));
}
