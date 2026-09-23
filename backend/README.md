# HackAlem backend

Run from `backend/`:

```sh
npm install
npm run lint
npm run test
npm run build
npm run start:dev
```

API listens on port 3001. Swagger is at `/api/docs`; endpoints are `/api/v1/health`, `/api/v1/catalog`, and `/api/v1/recommendations`. The original CSV in the repository root is read on startup. For Docker, build from the **repository root** with `docker build -f backend/Dockerfile .`; the image copies the original CSV to `/data/contractors.csv`.

Copy `.env.example` to `.env` for local settings. With no `OPENAI_API_KEY`, the backend uses deterministic local scoring and grounded explanations. With a key, it calls the official OpenAI Responses API using Structured Outputs; invalid output, refusal, or timeout falls back to local scoring. The key stays on the server. The configured timeout must be at most 7000 ms, and automatic retries are disabled.

The first valid response for a normalized request is saved under `CACHE_DIR` (default `./cache`). The cache key includes the dataset hash, model, prompt version, and AI enabled mode. Subsequent requests and process restarts use that snapshot. Mount `/app/backend/cache` as a named Docker volume to keep snapshots across container restarts. Removing the cache or changing the dataset, model, or prompt version starts a new set of snapshots. The MVP supports one backend process; multiple replicas need shared coordination for first write. Snapshot files contain only API responses, never credentials.

All candidate identity, availability, price, and quality flags come from the CSV. `priceFromKzt` is a starting price, not a guaranteed quote. Exclusion counts are independent, so they can overlap.
