# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

**`loc-prag-agent`** is a standalone fork of `loc-prag` created to deliver an
**AI Developer test assignment**: build an AI Agent that solves a realistic
business case end-to-end (multi-step workflow, tool-using, structured outputs,
tests, deployable to a VPS).

The full assignment is at `docs/Test_task_AI_Developer.pdf`. Read it first
when picking up work here — it defines the required deliverables and evaluation
criteria.

Current state, decisions already made, open questions, and the implementation
plan live in **`AGENT_PROJECT.md`**. Always read that file at the start of a
session before writing code.

## Business workflow being built

A **Real Estate Search Agent** for the Czech rental/sale market:

1. User submits criteria in natural language (e.g. *"2+kk in Prague 5 up to
   25 000 CZK, near metro, no agencies"*).
2. Agent plans a multi-step search → calls scraping tools (`bazos.cz`,
   `bezrealitky.cz`) → classifies & filters listings via LLM → ranks results
   → drafts a Czech inquiry message for the top matches.
3. Returns a **structured JSON result + a human-readable summary**.
4. Persists the run (criteria, listings, decisions, tool traces) in MongoDB
   for observability.

The agent itself lives in a **new** `agent-service/` (to be created — see
`AGENT_PROJECT.md`). The four existing services are kept as a foundation /
reference for patterns; they may be reused or trimmed depending on scope.

## Project structure

This repository was copied from `loc-prag` and currently contains its four
services unchanged. The `agent-service/` (the actual deliverable) will be
added on top.

### `api-service/` - NestJS GraphQL API
- **Framework**: NestJS with GraphQL API
- **Database**: MongoDB with Mongoose
- **Package Manager**: Yarn (mandatory)
- **Role in this project**: source of patterns (Mongoose models, module
  layout, logging). May host the agent's persistence layer if we decide not
  to give `agent-service` its own DB layer.

### `localno-web/` - Next.js Frontend
- **Framework**: Next.js 15 with TypeScript
- **Architecture**: Feature-Sliced Design (FSD) - strictly enforced
- **UI Library**: shadcn/ui components (mandatory)
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Package Manager**: Yarn (mandatory)
- **Role in this project**: optional — only used if we add a web UI for the
  agent (out of MVP scope unless explicitly requested).

### `db_watcher/` - MongoDB Change Stream Watcher
- **Framework**: Node.js with TypeScript
- **Purpose**: MongoDB change streams watcher for real-time data processing
- **Package Manager**: Yarn (mandatory)
- **Role in this project**: provides BullMQ/Redis patterns we may reuse for
  background scraping jobs and the Telegram notification surface.

### `localno_redis/` - Redis Stack Service
- **Framework**: Redis Stack with Docker
- **Purpose**: Centralized Redis service for all microservices
- **Package Manager**: Yarn (mandatory)
- **Role in this project**: queue / cache for the agent (rate-limiting tool
  calls, memoizing scrape results).

### `agent-service/` - AI Agent (TO BE CREATED)
- **Framework**: NestJS + TypeScript (matches the rest of the stack)
- **Agent SDK**: OpenAI Agents SDK (tentative — see open questions in
  `AGENT_PROJECT.md`)
- **LLM**: OpenAI `gpt-4o-mini` (tentative)
- **Purpose**: planner/executor agent with at least 2 tools, structured
  outputs, guardrails, observability, tests.

## Development Commands

### Root Level (using Makefile)
```bash
make dev          # Start both api-service and localno-web
make api          # Start only API service
make web          # Start only web application
make install      # Install dependencies for both projects
make build        # Build both projects
make alint        # Lint API service
make wlint        # Lint web application
```

### API Service (api-service/)
```bash
yarn dev          # Development server
yarn build        # Build for production
yarn lint         # Run linter with fixes
yarn format       # Format code with Prettier
```

### Web Application (localno-web/)
```bash
yarn dev          # Development server with Turbo
yarn build        # Build for production
yarn lint         # Run ESLint
yarn lint:fix     # Run ESLint with fixes
```

### DB Watcher (db_watcher/)
```bash
yarn dev          # Development server (NODE_ENV=local)
yarn start:dev    # Development server (NODE_ENV=development)
yarn start:prod   # Production server (NODE_ENV=production)
yarn build        # Build TypeScript to dist/
yarn nodemon      # Development with auto-reload
```

### Redis Service (localno_redis/)
```bash
# Manual local startup (recommended)
docker-compose --env-file .env.local -f docker-compose.local.yml up -d

# Or using yarn scripts:
yarn local:up     # Start local Redis container
yarn local:down   # Stop local Redis container
yarn test:local   # Test local Redis connection
yarn dev:up       # Start dev Redis container
yarn prod:up      # Start production Redis container
yarn status       # Show Redis containers status
yarn clean:all    # Remove all Redis containers and volumes
```

### Agent Service (agent-service/) — to be added
Commands will be defined when the service is scaffolded.

## Architecture Requirements

### Feature-Sliced Design (FSD) — frontend only
The frontend follows FSD architecture with these layers (top to bottom):
- `app/` - Application initialization
- `pages/` - Route pages
- `widgets/` - Composite UI blocks
- `features/` - Business functionality
- `entities/` - Business entities
- `shared/` - Reusable code

**Critical FSD Rules:**
- Higher layers can only import from lower layers
- Slices within the same layer cannot import from each other
- All imports must go through `index.ts` files (Public API)
- Each slice should have segments: `ui/`, `model/`, `api/`, `lib/`

### UI Components
- **MANDATORY**: Use shadcn/ui components exclusively
- **FORBIDDEN**: Create custom base UI components (buttons, inputs, etc.)
- Configuration in `components.json`
- Import path: `@/components/ui/`

### Agent design constraints (agent-service)
- Multi-step workflow — never a single prompt
- ≥ 2 tools (e.g. `search_bazos`, `search_bezrealitky`, `classify_listing`,
  `draft_inquiry`, `persist_run`)
- Structured JSON result + human-readable summary
- Guardrails: input validation, refusal rules, retries with backoff
- Observability: persist every tool call, arguments, result, latency,
  token usage. Surface a trace per run.
- Tests: unit per tool + ≥ 1 e2e with the real agent loop (LLM mocked or
  using a cheap model).

## Key Technologies & Patterns

### Backend (api-service)
- GraphQL with code-first approach
- Mongoose models with proper typing
- JWT + Google OAuth authentication
- File upload handling with Multer
- Modular NestJS architecture

### DB Watcher (db_watcher)
- MongoDB change streams for real-time data watching
- BullMQ for job queue management with Redis
- Telegraf for Telegram bot integration
- Bull Board dashboard for queue monitoring
- Winston for structured logging
- TypeScript with strict typing

### Frontend (localno-web)
- Next.js App Router
- Apollo Client for GraphQL
- Internationalization with next-intl
- Form handling with react-hook-form + Zod validation
- State management with Zustand

## Package Management
- **ALWAYS use Yarn** (never npm)
- All projects use `yarn.lock`
- Use `yarn` commands for all package operations

## Environment Setup

### MongoDB
We are using a **new** MongoDB instance for this project (not the original
`loc-prag` database). The connection string will be supplied by the user and
placed in each service's `.env.local`. See `AGENT_PROJECT.md` for the current
status.

### API Service
Required `.env.local` variables:
- `JWT_SECRET`
- `MONGODB_URI` — points to the new agent DB
- `GOOGLE_CLIENT_ID`

### Web Application
Uses environment-specific files and dotenv-cli for local development.

### DB Watcher
Required environment variables:
- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_PASSWORD`
- `MONGODB_URI` — points to the new agent DB
- `BOT_TOKEN` (Telegram bot token)

### Redis Service
Environment-specific `.env` files required:
- `.env.local` - for local development
- `.env.development` - for dev environment
- `.env.production` - for production
Required variables:
- `REDIS_PASSWORD`
- `PROTECTED_MODE` (yes/no)
- `REDIS_MAXMEMORY` (e.g., 512mb)
- `MAXMEMORY_POLICY` (e.g., allkeys-lru)

### Agent Service
To be defined. At minimum will need:
- `OPENAI_API_KEY` (or `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` depending on
  the final LLM choice — see `AGENT_PROJECT.md`)
- `MONGODB_URI`
- `REDIS_*` for queue and caching

## Important Notes
- This repository is a **fork of `loc-prag`** for the AI Developer test task.
  The original lives at `/home/alex/Project/loc-prag/` and must not be modified
  from here.
- Follow TypeScript strict mode in all TypeScript projects.
- Use ESLint + Prettier configuration where applicable.
- GraphQL schema is auto-generated in `api-service/src/schema.gql`.
- DB Watcher runs on port 3010 (local) or 3002 (production) with Bull Board
  dashboard at `/admin/queues`.
- Redis service uses Docker containers with environment-specific configurations.
- The frontend's old Cursor rules incorrectly mention Nuxt.js — it actually
  uses Next.js.
- The final deliverable must be a public Git repository with a README that
  covers: problem statement, scope, business cases, architecture, setup,
  how to test, examples, trade-offs, and a "Real-world usage" section.
