# HackAlem backend

Run from `backend/`:

```sh
npm install
npm run lint
npm run test
npm run build
npm run start:dev
```

API listens on port 3001. Swagger is at `/api/docs` (JSON at `/api/docs-json`); endpoints are `/api/v1/health`, `/api/v1/catalog`, and `/api/v1/recommendations`. Use Node.js 22.13 or newer in the Node.js 22 line (some development dependencies require this patch level).

The byte-for-byte copy of the supplied CSV at `data/contractors.csv` is read on startup by default. `DATASET_PATH` can override this location. The repository-root original is unchanged. For Docker, build from the **repository root** with `docker build -f backend/Dockerfile -t hackalem-backend .`; the image copies `backend/data/contractors.csv` to `/data/contractors.csv`. `Dockerfile.dockerignore` limits this root build context to backend source, configuration and data, excluding credentials and local caches.

Copy `.env.example` to `.env` for local settings. With no `OPENAI_API_KEY`, the backend uses deterministic local scoring and grounded explanations. With a key, it calls the official OpenAI Responses API using Structured Outputs; invalid output, refusal, or timeout falls back to local scoring. The key stays on the server. The configured timeout must be at most 7000 ms, and automatic retries are disabled.

The first valid response for a normalized request is saved under `CACHE_DIR` (default `./cache`). The cache key includes the dataset hash, model, prompt version, and AI enabled mode. Subsequent requests and process restarts use that snapshot. Mount `/app/backend/cache` as a named Docker volume to keep snapshots across container restarts. Removing the cache or changing the dataset, model, or prompt version starts a new set of snapshots. The MVP supports one backend process; multiple replicas need shared coordination for first write. Snapshot files contain only API responses, never credentials.

All candidate identity, availability, price, and quality flags come from the CSV. `priceFromKzt` is a starting price, not a guaranteed quote. Exclusion counts are independent, so they can overlap.

## Frontend contract

`POST /api/v1/recommendations` returns HTTP 200 for every domain outcome. HTTP 400 means invalid input; HTTP 429 means the rate limit (60 requests per minute per route/IP) was exceeded.

```json
{
  "city": "Алматы",
  "date": "2026-10-15",
  "eventType": "корпоратив",
  "category": "Ведущий",
  "budgetKzt": 900000,
  "language": "русский",
  "durationHours": 6
}
```

`eventType` is the requested public input. Existing frontend clients may use `eventFormat` as an alias. At least one is required. Both together must match after normalization, otherwise the server returns 400. Both names produce the same snapshot key. Language and duration are optional; explicit `null` is rejected. Budget is a positive safe integer, duration is positive and at most 24 hours. Dates must be real ISO calendar dates within 2026-09-23 through 2026-12-31; outside this window availability is unknown.

```ts
type RecommendationResponse = {
  status: 'matched' | 'no_category_in_city' | 'no_candidates_after_filters';
  count: number;
  totalCandidates: number;
  eligibleCount: number;
  message: string;
  analysisMode: 'ai' | 'fallback' | 'not_needed';
  exclusions: { busy: number; budget: number; format: number; language: number; duration: number };
  items: Array<{
    id: string; name: string; category: string; city: string;
    priceFromKzt: number; explanation: string;
    synthetic: boolean; city_imputed: boolean; price_imputed: boolean;
  }>;
};
```

`count` equals the number of returned cards (0 to 3); `eligibleCount` is the number before top-three selection. `message` includes the date and explains shortages. Categories can be composite in CSV; `category` in a card is the matched category. `GET /api/v1/catalog` provides cities, individual categories, event formats, languages and the supported calendar window. `GET /api/v1/health` returns `{ "status": "ok", "contractors": 66 }`.

## Modules and AI guarantees

- `config`: validates environment values at startup without logging credentials.
- `contractors`: strict CSV loader, canonical profile repository and catalog; pipe-separated lists and quality flags are preserved.
- `matching`: city/category population, busy dates, budget, event format, optional language/duration; null maximum hours never excludes a profile.
- `ai`: official OpenAI SDK Responses API, Zod Structured Outputs, strict ID/score/evidence validation and a seven-second abort deadline with no retries.
- `recommendations`: orchestration, two-sentence explanations, stable score/price/ID ordering and persisted snapshots with concurrent request coalescing.
- `health`: health and catalog endpoints.
- `common`: domain types and shared HTTP setup, including validation, Helmet, CORS and Swagger.

AI receives only eligible candidates. The schema cannot add price/name/availability fields to model output; the server assembles all such facts directly from CSV. Evidence must be an exact, distinct quote from the corresponding description; generated reasons must mention the event format and cannot claim prices, availability, discounts or languages. Semantic relevance remains a model judgment, while identity, prices, calendar and constraints are checked deterministically. Errors, refusal, incomplete/invalid output and timeout all use grounded local explanations and scoring.

Temperature is not used as a guarantee of reproducibility. The saved first response, pipeline/prompt versions and the single-process deployment constraint define reproducibility. Changing filters, scoring or output requires a `pipelineVersion` bump; changing AI input/prompt requires a `PROMPT_VERSION` bump.

All Jest/Supertest tests use offline SDK mocks: no API credits are spent by `npm test`. A real provider check requires a backend-only API key and is separate from these tests. The implementation follows [OpenAI Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs).
