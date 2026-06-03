# AGENT_PROJECT.md

Single source of truth for the AI Developer test assignment delivered from
this repository. Read this **before** writing any code in a new session.

The task itself is at `docs/Test_task_AI_Developer.pdf`.

---

## TL;DR

We are building a **Real Estate Search Agent** for the Czech market
(`bazos.cz` + `bezrealitky.cz`) as a new `agent-service/` on top of the
existing `loc-prag` services (forked into this `loc-prag-agent/` repo).

The agent must satisfy every "must have" from the test PDF: multi-step
workflow, ≥ 2 tools, structured outputs, guardrails, observability, tests,
README with the required sections (including "Real-world usage").

---

## Decisions already locked in

| Topic | Decision | Rationale |
|---|---|---|
| Repo layout | New folder `loc-prag-agent/` forked from `loc-prag/` | User wants a standalone deployable project, no risk to the original codebase. |
| Services copied | All four (`api-service`, `localno-web`, `db_watcher`, `localno_redis`) | User asked to keep everything; `node_modules`, `.next`, `dist`, build artefacts were excluded by rsync. |
| Database | New MongoDB Atlas M0 (free tier), region AWS `eu-central-1` | Closest to Prague, free, easy to point a VPS at. User is creating the cluster and will paste the URI. |
| LLM provider | **OpenAI `gpt-4o-mini`** (CONFIRMED 2026-06-03) | Cheapest tool-calling model with mature ecosystem, ~$0.0005 per agent run. Gemini 2.5 Flash and Claude Haiku 4.5 were the considered alternatives. |
| Agent integration | New `agent-service/` (Variant B) | Cleaner README/demo, isolates the agent from legacy CRUD, deploys as its own container. Variant A (module inside `api-service`) was rejected. |
| Agent framework | **Official `openai` SDK + hand-rolled planner/executor loop** (CHANGED 2026-06-03 from OpenAI Agents SDK) | The grading weights observability heavily (log every tool call: args, result, duration, token usage). A manual loop gives full control over per-tool tracing and is trivial to mock in tests; the Agents SDK hides tracing internally. Structured outputs use `response_format: json_schema` + Zod validation. |

## Open questions / pending inputs from user

- [ ] **MongoDB Atlas connection string** (user is creating the cluster). Expected shape:
  `mongodb+srv://agent:<password>@loc-prag-agent.xxxxx.mongodb.net/loc_prag_agent?retryWrites=true&w=majority`
- [ ] **OpenAI API key** (`OPENAI_API_KEY`). Will be placed in
  `agent-service/.env.local`, never committed. (User obtaining it — needs a
  funded OpenAI platform account.)
- [x] Final LLM choice: **`gpt-4o-mini`** (confirmed 2026-06-03).
- [ ] Telegram bot scope: do we plug the agent into the existing `db_watcher`
  bot infra, or skip Telegram for the test?
- [ ] Web UI: in or out of MVP? (Currently out unless the user asks for it.)

## What is already done

1. Repo forked from `/home/alex/Project/loc-prag/` to `/home/alex/Project/loc-prag-agent/`
   via `rsync` with sensible excludes (`node_modules`, `.next`, `dist`, build,
   `.turbo`, `coverage`, `.cache`, logs, `.DS_Store`).
2. Test task PDF copied to `docs/Test_task_AI_Developer.pdf`.
3. `CLAUDE.md` rewritten to describe this project's actual purpose (AI agent
   delivery), keeping the original service docs as background.
4. This `AGENT_PROJECT.md` written as the implementation-status file.
5. **`agent-service/` scaffolded and green (2026-06-03):** NestJS 10 + strict
   TS, builds clean (`yarn build`), 6 tests pass (`yarn test`), lint clean
   (`yarn lint`, only `any` warnings in test mocks). Structure:
   `src/agent/{agent.service,planner.service,summary.renderer, llm/openai.service,
   tools/*, schemas/*, dto/*}`, `src/persistence/*`, `src/health`, `src/config`,
   `src/common/logger`. Deps installed (`openai`, `zod`, `zod-to-json-schema`,
   `cheerio`, `@nestjs/mongoose`, `nest-winston`, …). `.env.example` written.
   HTTP API: `POST /agent/search`, `GET /agent/runs[/:id]`, `GET /health`.
6. Planner/executor loop implemented end-to-end with per-tool tracing
   (args/result/error/duration/tokens), Zod-validated structured output +
   Markdown summary, scope-refusal guardrail, OpenAI retries w/ backoff.

## What is NOT done yet

- [x] `agent-service/` scaffold (NestJS module, tooling, env, lint, tests)
- [x] MongoDB URI plugged into `agent-service/.env.local` — Atlas
  `loc_prag_agent` verified reachable (ping ok). Runs persist + retrieve OK.
- [x] OpenAI key configured in `.env.local` — verified (live `gpt-4o-mini` call).
- [x] **Live end-to-end run succeeded (2026-06-03):** query "2+kk Praha 5 do
  25000, blízko metra, bez realitky" → status `completed`, 14 found / 11 after
  filtering, real Czech inquiry drafts, ~9.3k tokens, ~10.8s, full trace
  persisted to Mongo and retrievable via `GET /agent/runs/:id`.
- [~] Tools implemented:
  - [x] `search_bazos(criteria)` — cheerio scraper; **live selectors VERIFIED
    working** (returned 15-20 real listings in live runs).
  - [x] `search_bezrealitky(criteria)` — GraphQL client; **rewritten against the
    live schema and VERIFIED** (2026-06-03): list-typed enum filters
    (`[OfferType]`/`[EstateType]`/`[Disposition]`), `priceFrom/priceTo`,
    `surfaceFrom`, `address(locale: CS)`, browser headers (else 403), CZK-only
    + client-side city filter. Returned 19 real Praha listings in the live run.
  - [x] `classify_listing(listing)` — LLM classifier (private/agency/scam +
    0-100 quality score), Zod-validated.
  - [x] `draft_inquiry(listing, criteria)` — Czech outreach draft.
  - [x] `persist_run(state)` — Mongo writer (`RunRepository`), best-effort.
- [x] Planner / executor loop (multi-step) with guardrails (input validation
  via DTO, retries with backoff in `OpenAiService`, scope refusal in planner)
- [x] Structured output schema (Zod) + human-readable summary renderer
- [x] Observability: persisted tool traces, run-level summary, Winston logs
- [~] Tests (9 passing):
  - [~] Unit per tool (bazos parser + bezrealitky mapping/vars/city-filter done;
    classify/draft LLM tools still pending)
  - [x] ≥ 1 e2e run of the full agent loop (LLM mocked) — `agent.service.spec.ts`
- [ ] `docker-compose.yml` at the repo root that brings up Mongo (or points
  at Atlas), Redis, `api-service` (optional), `agent-service`
- [ ] README rewrite covering every section the test requires (problem
  statement, scope, business cases, architecture, setup, testing, examples,
  trade-offs, **Real-world usage**)
- [x] Public Git repo (GitHub) initialised and pushed — **published 2026-06-03**:
  public deliverable at https://github.com/alextotalk/loc-prag-agent (main, 47
  files, no secrets/node_modules). The four foundation services were detached
  from their old gitlab.com/localno remotes and pushed to separate **private**
  repos (api-service, db_watcher, localno-web, localno_redis) under alextotalk.

## Target architecture (high level)

```
User ──HTTP/CLI──▶ agent-service ──┬─▶ search_bazos        (cheerio scraper)
                                   ├─▶ search_bezrealitky  (GraphQL client)
                                   ├─▶ classify_listing    (LLM)
                                   ├─▶ draft_inquiry       (LLM)
                                   └─▶ persist_run         (MongoDB)
                                          │
                                  Redis (rate-limit / cache)
                                          │
                                       Logs / Traces (Winston + Mongo)
```

Planner/executor loop:

1. **Plan** — LLM parses natural-language criteria into a structured query
   (Zod-validated). Refuses out-of-scope requests.
2. **Search** — calls scrapers in parallel, paginates, dedupes.
3. **Classify & filter** — LLM tags each listing, hard filters drop obvious
   misses, soft scoring ranks the rest.
4. **Draft** — for the top N, LLM produces a personalised Czech inquiry.
5. **Persist & summarise** — write run state to Mongo, return structured JSON
   plus a Markdown summary for humans.

## Setup checklist for a fresh session

When picking up work in a new Claude Code session:

1. Read `docs/Test_task_AI_Developer.pdf` (or the summary above).
2. Read this file end-to-end.
3. `ls` the repo and check whether `agent-service/` exists.
4. If `.env.local` files are missing the new `MONGODB_URI` / `OPENAI_API_KEY`,
   ask the user before proceeding — do not invent values.
5. Use the "What is NOT done yet" checklist to pick the next task.

## House rules for this project

- Never modify `/home/alex/Project/loc-prag/` from this session — it is the
  original repo, untouched.
- Yarn only, never npm.
- TypeScript strict mode everywhere.
- Don't commit secrets — `.env.local` is gitignored; use `.env.example` as
  the public template.
- Every tool call inside the agent **must** be logged with: tool name, args,
  result (or error), duration, token usage. This is graded.
- README is part of the deliverable — keep it in sync as features land.
