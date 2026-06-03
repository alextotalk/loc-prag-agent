# agent-service

AI **Real Estate Search Agent** for the Czech rental/sale market — the
deliverable for the AI Developer test task. See the repo-root `AGENT_PROJECT.md`
for status and `docs/Test_task_AI_Developer.pdf` for the assignment.

## What it does

Takes a natural-language request (e.g. *"2+kk in Prague 5 up to 25 000 CZK,
near metro, no agencies"*) and runs a **multi-step planner/executor loop**:

1. **plan** — LLM parses the request into structured `SearchCriteria`
   (Zod-validated) and refuses out-of-scope requests (scope guardrail).
2. **search** — `search_bazos` (cheerio scraper) + `search_bezrealitky`
   (GraphQL client) run in parallel; results are deduped.
3. **classify** — `classify_listing` (LLM) tags each listing: seller type,
   scam risk, 0-100 quality/fit score.
4. **filter + rank** — hard filters drop scams/agencies (when "no agencies"),
   score ranks the rest.
5. **draft** — `draft_inquiry` (LLM) writes a Czech inquiry for the top N.
6. **persist + summarise** — the run (criteria, listings, full tool trace,
   token usage) is written to MongoDB; the API returns structured JSON + a
   Markdown summary.

## Stack

NestJS 10 · TypeScript (strict) · OpenAI `gpt-4o-mini` (official SDK, manual
tool loop) · Zod (I/O contracts) · Mongoose (observability store) · Winston.

## Run locally

```bash
cp .env.example .env.local      # fill OPENAI_API_KEY + MONGODB_URI
yarn install
yarn dev                        # http://localhost:3020
```

```bash
# trigger a run
curl -X POST http://localhost:3020/agent/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"2+kk Praha 5 do 25000, blízko metra, bez realitky"}'

# inspect the persisted trace
curl http://localhost:3020/agent/runs/<runId>
```

## Test

```bash
yarn test        # unit (bazos parser) + e2e agent loop (LLM mocked)
```

## Layout

```
src/
  agent/
    agent.service.ts        # planner/executor loop + per-tool tracing
    planner.service.ts      # NL → criteria + scope guardrail
    summary.renderer.ts     # Markdown summary
    llm/openai.service.ts   # OpenAI wrapper: retries, structured JSON, usage
    tools/                  # search_bazos, search_bezrealitky, classify, draft
    schemas/                # Zod: criteria, listing, agent-result
    dto/                    # HTTP input validation
  persistence/              # Mongoose AgentRun schema + repository
  health/                   # GET /health
  config/ common/           # config + Winston
```

> Selector/GraphQL-shape verification against live `bazos.cz` /
> `bezrealitky.cz` is isolated in each tool's `parse()`/`mapNode()` and is the
> next implementation step (see `AGENT_PROJECT.md`).
