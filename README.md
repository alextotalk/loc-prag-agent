# Real Estate Search Agent (Czech market)

An **AI agent** that turns a free-text apartment request in plain Czech/English
(*"2+kk in Prague 5 up to 25 000 CZK, near metro, no agencies"*) into a ranked
shortlist of real listings — each with a ready-to-send Czech inquiry message —
and persists a full, inspectable trace of every step.

Built as the deliverable for the **AI Developer test assignment**
(`docs/Test_task_AI_Developer.pdf`). The agent lives in
[`agent-service/`](agent-service); the other folders (`api-service`,
`localno-web`, `db_watcher`, `localno_redis`) are the foundation project this
was forked from and are kept only as reference for patterns.

---

## Problem statement (business context)

Searching for a flat to rent in the Czech Republic is fragmented and noisy.
Listings are spread across several portals, the best ones (private, "no
agency") disappear within hours, and a renter has to:

1. re-type the same filters into each portal,
2. manually weed out agencies, reposts and obvious scams,
3. write an individual Czech message to each owner fast enough to beat other
   applicants.

This is repetitive, time-sensitive work that maps cleanly onto an agent:
**plan → gather from multiple sources → judge → rank → draft outreach**.

## What the agent does (scope + non-scope)

**In scope**

- Parse a natural-language request (CZ/EN) into structured, validated criteria.
- Search **two** sources in parallel: `bazos.cz` (HTML scrape) and
  `bezrealitky.cz` (GraphQL API, owner-only marketplace).
- Classify each listing with an LLM: seller type (private/agency/unknown),
  scam likelihood, 0–100 quality/fit score.
- Hard-filter (drop scams; drop agencies when the user said "no agencies"),
  then rank by score.
- Draft a personalised **Czech** inquiry message for the top N matches.
- Return structured JSON **and** a human-readable Markdown summary.
- Persist the whole run (criteria, listings, per-tool trace, token usage) to
  MongoDB and expose it over HTTP.

**Non-scope (deliberately out)**

- No automated *sending* of messages (human-in-the-loop on purpose — see
  Real-world usage).
- No login/scraping behind authentication; only public listing data.
- No web UI in the MVP (HTTP/JSON API + `curl`); the forked `localno-web` is
  not wired to the agent.
- Not a general assistant — out-of-scope requests are refused by the planner.

## Business cases covered

1. **Renter quick-shortlist** — "Find me private 2+kk flats in Prague 5 under
   25 000 CZK near metro and draft the messages." (primary demo)
2. **Buyer search** — same pipeline with `dealType: sale`.
3. **"No agencies" filter** — bezrealitky is prioritised and agency-classified
   listings are dropped.
4. **Scam screening** — listings flagged as likely scams are removed before
   they reach the user.
5. **Observability / audit** — every run is persisted with a full tool trace
   for debugging, evaluation and cost tracking.

## Architecture overview (components + data flow)

**Stack:** NestJS 10 · TypeScript (strict) · OpenAI `gpt-4o-mini` (official SDK
+ a hand-rolled planner/executor loop) · Zod (I/O contracts) · Mongoose
(MongoDB Atlas) · Winston (logs) · cheerio (scrape) · Redis (reserved for
rate-limiting/caching).

```
                 POST /agent/search { query }
                            │
                            ▼
                   ┌──────────────────┐
                   │   AgentService   │  planner/executor loop
                   │  (orchestrator)  │  + per-tool tracing
                   └──────────────────┘
                            │
   1. plan ───────► PlannerService ──► OpenAI (NL → Zod SearchCriteria,
                            │                    scope-refusal guardrail)
   2. search ─┬───► search_bazos        (cheerio HTML scrape)   ┐ parallel
              └───► search_bezrealitky  (GraphQL API)           ┘ → dedupe
   3. classify ──► classify_listing     (OpenAI, per listing)
   4. filter+rank  (deterministic: drop scams/agencies, sort by score)
   5. draft ─────► draft_inquiry        (OpenAI, top N, Czech message)
   6. persist ───► RunRepository ──► MongoDB Atlas (agent_runs)
                            │
                            ▼
        { structured JSON result + Markdown summary + traces }
```

**Why this framework choice (justification).** The assignment allows any agent
framework. I used the **official `openai` SDK with a custom orchestrator**
rather than the OpenAI Agents SDK / LangGraph because:

- The workflow is a *known* pipeline (plan→search→classify→rank→draft), so a
  deterministic orchestrator is more reliable and cheaper than letting an LLM
  free-pick tools every turn.
- Observability is graded heavily here. A hand-rolled loop lets me record an
  exact `ToolTrace` (args, result/error, duration, prompt/completion tokens)
  for **every** step — including the deterministic tools — which framework
  tracing tends to hide.
- It is trivial to unit-test and to mock (see `agent.service.spec.ts`, which
  drives the full loop with zero network calls).

Structured outputs use OpenAI `response_format: json_schema` and are then
re-validated with Zod, so a malformed model response fails loudly instead of
propagating.

**Key files**

| Concern | File |
|---|---|
| Orchestrator + tracing | `agent-service/src/agent/agent.service.ts` |
| Planner + scope guardrail | `agent-service/src/agent/planner.service.ts` |
| OpenAI wrapper (retries, structured JSON, usage) | `agent-service/src/agent/llm/openai.service.ts` |
| Tools | `agent-service/src/agent/tools/*` |
| Zod contracts | `agent-service/src/agent/schemas/*` |
| Persistence | `agent-service/src/persistence/*` |

## Setup instructions (local run)

**Prerequisites:** Node 22 + Yarn (or Docker), an OpenAI API key, and a MongoDB
connection string (Atlas free tier works).

### Option A — Docker (recommended)

```bash
cp agent-service/.env.example agent-service/.env.local
#   fill OPENAI_API_KEY and MONGODB_URI in agent-service/.env.local
docker compose up --build
# agent-service on http://localhost:3020, Redis alongside it
```

### Option B — local Node

```bash
cd agent-service
cp .env.example .env.local        # fill OPENAI_API_KEY + MONGODB_URI
yarn install
yarn dev                          # http://localhost:3020
```

Required env vars (see `agent-service/.env.example`): `OPENAI_API_KEY`,
`OPENAI_MODEL` (default `gpt-4o-mini`), `MONGODB_URI`. Redis/agent-tuning vars
are optional with sane defaults.

### HTTP API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/agent/search` | run the agent on `{ "query": "..." }` |
| `GET` | `/agent/runs/:runId` | fetch one persisted run + full trace |
| `GET` | `/agent/runs` | list recent runs |
| `GET` | `/health` | liveness |

## How to test/verify

### Automated tests (11 tests, 5 suites)

```bash
cd agent-service
yarn test           # unit + e2e
yarn test:cov       # with coverage
```

- **Unit** — `search_bazos` URL builder + HTML parser (fixture HTML);
  `search_bezrealitky` variable mapping, node mapping, CZK/city filtering
  (fixture JSON); `classify_listing` and `draft_inquiry` (OpenAI mocked).
- **Integration / e2e** — `agent.service.spec.ts` drives the **entire**
  planner/executor loop with the LLM and both scrapers mocked, asserting the
  happy path, the out-of-scope **refusal**, and the scam/agency filtering, plus
  that a `ToolTrace` is recorded for every step.

No network or API key is needed to run the tests.

### Manual scenarios

```bash
# 1. Happy path
curl -X POST http://localhost:3020/agent/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"2+kk Praha 5 do 25000 Kč, blízko metra, bez realitky"}'

# 2. Refusal guardrail (out of scope)
curl -X POST http://localhost:3020/agent/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"write me a poem about the sea"}'
# -> { "status": "refused", "refusalReason": "...", ... }

# 3. Input validation guardrail (too short) -> HTTP 400
curl -X POST http://localhost:3020/agent/search \
  -H 'Content-Type: application/json' -d '{"query":"hi"}'

# 4. Inspect the persisted trace of run #1
curl http://localhost:3020/agent/runs/<runId>
```

## Example inputs/outputs

**Input**

```json
{ "query": "2+kk Praha 5 do 25000 Kč, blízko metra, bez realitky" }
```

**Output (abridged real run)** — `status: completed`, 38 found / 36 after
filtering across both sources, ~20k tokens, ~11 s:

```jsonc
{
  "runId": "e05fad8e-1371-44a6-9333-182da7649ed5",
  "status": "completed",
  "criteria": {
    "dealType": "rent", "dispositions": ["2+kk"], "city": "Praha",
    "district": "Praha 5", "priceMax": 25000, "nearMetro": true,
    "excludeAgencies": true, "keywords": []
  },
  "totalFound": 38,
  "results": [
    {
      "rank": 1, "source": "bazos", "title": "2+kk ANDEL METRO CENTRUM TERASA",
      "priceCzk": 24500, "url": "https://reality.bazos.cz/inzerat/219419246/...",
      "classification": { "sellerType": "private", "isLikelyScam": false, "qualityScore": 85 },
      "inquiryDraft": "Dobrý den,\n\nmám zájem o pronájem bytu 2+kk ... Děkuji a těším se na Vaši odpověď."
    }
    // ...
  ],
  "usage": { "promptTokens": 8267, "completionTokens": 1077, "totalTokens": 9344 },
  "traces": [
    { "step": 0, "tool": "plan",             "ok": true, "durationMs": 1441, "promptTokens": 473, "completionTokens": 56 },
    { "step": 1, "tool": "search_bezrealitky","ok": true, "durationMs": 333,  "promptTokens": 0,   "completionTokens": 0 },
    { "step": 2, "tool": "search_bazos",      "ok": true, "durationMs": 300,  "promptTokens": 0,   "completionTokens": 0 },
    { "step": 3, "tool": "classify_listing",  "ok": true, "durationMs": 1206, "promptTokens": 508, "completionTokens": 51 }
    // ... draft_inquiry steps ...
  ]
}
```

**Human-readable summary (excerpt)**

```
## 2+kk to rent in Praha 5 up to 25 000 CZK

Found 11 matching listing(s). Top results:

1. 2+kk ANDEL METRO CENTRUM TERASA — 24 500 CZK · private · score 85/100
   https://reality.bazos.cz/inzerat/219419246/2kk-andel-metro-centrum-terasa.php
   > Dobrý den, mám zájem o pronájem bytu 2+kk ... Děkuji a těším se na Vaši odpověď.
```

More sample requests live in [`docs/sample-requests.http`](docs/sample-requests.http).

## Trade-offs, limitations, and next steps

**Trade-offs**

- **Custom orchestrator over a framework** — more control and observability,
  but I write the loop/state myself instead of getting it for free.
- **Deterministic pipeline over free tool-calling** — more reliable and cheaper
  for this known workflow, at the cost of dynamic flexibility.
- **`gpt-4o-mini`** — chosen for cost (~$0.002/run); a stronger model would
  classify/draft better but cost more.

**Limitations**

- Scrapers depend on the sites' current HTML/GraphQL shape; markup changes
  break them (isolated to each tool's `parse()`/`mapNode()` to localise fixes).
- bezrealitky is filtered by city **client-side** (the API needs an OSM region
  id for true geo-filtering), so recall is limited by the over-fetch `limit`.
- No caching/rate-limiting yet (Redis is wired but unused); repeated runs
  re-scrape and re-classify.
- Classification quality is bounded by `gpt-4o-mini` and the listing text.

**Next steps**

- Resolve city → OSM region id for precise bezrealitky geo-filtering.
- Add Redis caching of scrape + classification results and per-source rate
  limiting.
- Telegram surface (reuse `db_watcher` bot infra) for notifications + an
  approve-to-send human-in-the-loop step.
- Prompt-injection hardening on scraped listing text before it hits the LLM.
- Eval harness over a labelled fixture set to track classification accuracy.

## Real-world usage

**Is this solution currently used in any business?** — **Not in production
today.** It is a working prototype built for this assignment.

**Who could use it (2–3 realistic teams):**

1. **Relocation / expat-services agencies** in Prague/Brno — auto-shortlist
   flats for incoming clients and pre-draft owner outreach in Czech.
2. **Small rental-hunting concierge services** — offer "we find and contact
   owners for you" as a paid service, with a human approving each message.
3. **PropTech aggregators** — use the classify/scam-screening + dedupe pipeline
   as an enrichment layer over their listing ingestion.

**What productionising would require:**

- **Security:** secrets manager (not `.env`), authn/z on the API, prompt-
  injection defenses on scraped text, ToS/legal review and rate-limit-respecting
  scraping (or official feeds/partnerships).
- **Monitoring:** the per-run traces already feed this — add dashboards/alerts
  on latency, token cost, tool error rates and classification drift.
- **Data access:** official portal APIs/partnerships instead of scraping;
  durable storage with retention/GDPR handling for personal contact data.
- **Human-in-the-loop:** keep message *sending* behind explicit approval (it is
  out of scope here by design).
- **Compliance:** GDPR for stored listing/contact data; fair-housing /
  anti-discrimination checks so criteria can't encode unlawful filters.

---

> Project status, decisions and the implementation checklist live in
> [`AGENT_PROJECT.md`](AGENT_PROJECT.md). Agent-service-specific notes are in
> [`agent-service/README.md`](agent-service/README.md).
