# MVP integration contract

This contract coordinates independent backend/frontend implementation. Root AGENTS.md and
the original DOCX remain authoritative. All product text is Russian.

## HTTP

- Backend: port 3001, prefix `/api/v1`, Swagger `/api/docs`.
- Frontend: port 3000. Browser calls relative `/api/v1/*`, Next route handler proxies to
  server-only `BACKEND_URL` (default `http://localhost:3001`). Never expose OpenAI secrets.
- `GET /api/v1/health`: `{ status: "ok", contractors: 66 }`.
- `GET /api/v1/catalog`: `{ cities: string[], categories: string[], eventFormats: string[],
  languages: string[], calendar: { from: "2026-09-23", to: "2026-12-31" } }`.
- `GET /api/v1/contractors`: read-only paginated view of the anonymized dataset. Supported
  query fields: `city`, `category`, `profileType=real|synthetic`, `search`, `page`, `limit`.
- `POST /api/v1/intake/parse`: accepts `{ message: string }` and returns recognized form
  `values`, `assumptions`, required `missing` fields, `confidence` and `analysisMode`.
- `POST /api/v1/recommendations`, HTTP 200 for all three domain outcomes.

Request: `{ city: string, date: "YYYY-MM-DD", eventFormat: string, category: string,
budgetKzt: number, language?: string, durationHours?: number }`.
Budget must be a positive integer; optional duration > 0 and <= 24. Trim/case-normalize strings.
Reject impossible dates and dates outside the known calendar with HTTP 400 (do not pretend
unknown availability is free). No free-text extra input required by MVP.

Response:

```ts
type RecommendationResponse = {
  status: 'matched' | 'no_category_in_city' | 'no_candidates_after_filters';
  count: number; // number of returned cards, 0..3
  exactCount: number;
  alternativeCount: number;
  totalCandidates: number; // city/category population BEFORE all remaining filters
  eligibleCount: number; // all candidates passing hard filters, before top 3
  message: string; // count and concrete shortage/exclusion reasons, date included
  analysisMode: 'ai' | 'fallback' | 'not_needed';
  exclusions: { busy: number; budget: number; format: number; language: number; duration: number };
  items: {
    id: string;
    name: string;
    category: string; // matched category
    city: string;
    priceFromKzt: number;
    explanation: string; // 1-2 grounded Russian sentences, unique per contractor
    synthetic: boolean;
    city_imputed: boolean;
    price_imputed: boolean;
    matchType: 'exact' | 'alternative';
    alternative: boolean;
    availableDate: string;
    matchedFields: string[];
    differences: {
      field: 'date' | 'budget' | 'language' | 'duration';
      requested: string | number;
      offered: string | number;
      message: string;
    }[];
  }[];
};
```

Exclusion counts are independent reasons: one candidate may fail several, so do not sum them
as number of removed candidates. `priceFromKzt` is a starting price, not a guaranteed quote.
Format and optional language/duration are hard filters. `max_hours=null` passes duration.
Metadata and flags always come from CSV, never from model output.

Exact matches always precede alternatives. An alternative keeps city, category and event
format unchanged, and may only relax date, budget (up to 30%), language or duration (up to
4 hours). Every relaxation is returned in `differences`; a card with hidden compromises is
invalid. If there is no requested category in the city, the API explains that outcome instead
of substituting another service.

## AI and reproducibility

Real OpenAI SDK Responses API + `zodTextFormat`; timeout <= 7 seconds, no automatic retries.
AI sees all and only eligible candidates and ranks by semantic suitability for event format.
Require distinct eligible IDs, finite bounded scores, grounded evidence from each description,
and specific 1-2 sentence explanations. Assemble factual identity/price/flags from repository.
Sort score descending, price ascending, ID ascending. Fallback uses deterministic scoring and
distinctive profile evidence. Never equate LLM temperature=0 with determinism.

Persist first valid final response (including fallback) per normalized request + dataset hash +
model + prompt version + AI-enabled mode to local JSON cache, and coalesce concurrent identical
requests. Cache persists through backend restart and Docker named volume. No DB/Redis required.
Document that removing cache or changing model/data/version starts a new recommendation snapshot.
One backend process is the supported MVP deployment. Do not cache secrets.

The intake parser also uses Responses API Structured Outputs, then validates every extracted
catalog value in code. Unknown required values stay in `missing`; the fallback recognizes basic
formats, amounts, dates and explicit catalog terms without inventing fields.

## Independent fixture checks

- Dataset count 66, cities Алматы=50 / Астана=15 / Зарубежье=1.
- Flags synthetic=13 / city_imputed=8 / price_imputed=18.
- Алматы/Ведущий: population 10, calendar-free Oct 15 = 8, Dec 20 = 2.
- Астана/Флорист/Nov 14: population 1, calendar-free 1.
- Астана/Инструменталист: population 0 (use for absent category demo).
- Dense demo: Алматы, 2026-10-15, корпоратив, Ведущий, 900000, русский.
- Rare demo: Астана, 2026-11-14, корпоратив, Флорист, 900000, русский.
- Filtered demo: dense request with budget 1.

## Ownership

- Orchestrator: integration, root Docker Compose, root docs, review and end-to-end verification.
- Backend executor: ONLY `backend/**`, including Dockerfile, env, source, tests and npm lock.
- Frontend executor: ONLY `frontend/**`, including Dockerfile, env, source, tests and npm lock.
- Review executor: read-only independent invariant/security/contract audit; no edits.

All agents preserve existing files, do not commit/push, do not modify original DOCX/CSV/HTML.
Backend reads root CSV by default; Docker copies the original into the image using root context.
