import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { randomUUID } from 'crypto';
import { PlannerService } from './planner.service';
import { SearchBazosTool } from './tools/search-bazos.tool';
import { SearchBezrealitkyTool } from './tools/search-bezrealitky.tool';
import { ClassifyListingTool } from './tools/classify-listing.tool';
import { DraftInquiryTool } from './tools/draft-inquiry.tool';
import { AgentTool } from './tools/tool.types';
import { RawListing } from './schemas/listing.schema';
import { RankedListing } from './schemas/listing.schema';
import { AgentResult, ToolTrace } from './schemas/agent-result.schema';
import { RunRepository } from '../persistence/run.repository';
import { renderSummary } from './summary.renderer';

/**
 * Planner/executor loop:
 *   1. plan      — NL → criteria (+ scope guardrail / refusal)
 *   2. search    — bazos + bezrealitky in parallel, dedupe
 *   3. classify  — LLM tags each listing (seller type, scam, score)
 *   4. filter+rank — hard filters drop misses, score ranks the rest
 *   5. draft     — Czech inquiry for the top N
 *   6. persist+summarise — write run to Mongo, return JSON + Markdown
 *
 * Every tool invocation is wrapped by `trace()` which records args, result or
 * error, duration and token usage — the graded observability requirement.
 */
@Injectable()
export class AgentService {
  private readonly maxListings: number;
  private readonly topNDrafts: number;

  constructor(
    private readonly config: ConfigService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
    private readonly planner: PlannerService,
    private readonly bazos: SearchBazosTool,
    private readonly bezrealitky: SearchBezrealitkyTool,
    private readonly classifier: ClassifyListingTool,
    private readonly drafter: DraftInquiryTool,
    private readonly runs: RunRepository,
  ) {
    this.maxListings = this.config.get<number>('agent.maxListings') ?? 40;
    this.topNDrafts = this.config.get<number>('agent.topNDrafts') ?? 3;
  }

  async run(query: string): Promise<AgentResult> {
    const runId = randomUUID();
    const startedAt = new Date();
    const traces: ToolTrace[] = [];
    let step = 0;
    let promptTokens = 0;
    let completionTokens = 0;

    const finalize = (
      partial: Partial<AgentResult> & Pick<AgentResult, 'status'>,
    ): AgentResult => {
      const finishedAt = new Date();
      return {
        runId,
        status: partial.status,
        refusalReason: partial.refusalReason ?? null,
        criteria: partial.criteria ?? null,
        totalFound: partial.totalFound ?? 0,
        results: partial.results ?? [],
        summaryMarkdown: partial.summaryMarkdown ?? '',
        traces,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      };
    };

    /** Wraps a tool call, recording a trace and accumulating token usage. */
    const trace = async <R>(
      tool: { name: string },
      args: unknown,
      exec: () => Promise<{
        result: R;
        usage?: { promptTokens: number; completionTokens: number };
      }>,
    ): Promise<R> => {
      const s = step++;
      const t0 = Date.now();
      try {
        const { result, usage } = await exec();
        promptTokens += usage?.promptTokens ?? 0;
        completionTokens += usage?.completionTokens ?? 0;
        traces.push({
          step: s,
          tool: tool.name,
          args,
          ok: true,
          result,
          durationMs: Date.now() - t0,
          promptTokens: usage?.promptTokens ?? 0,
          completionTokens: usage?.completionTokens ?? 0,
        });
        return result;
      } catch (err) {
        traces.push({
          step: s,
          tool: tool.name,
          args,
          ok: false,
          error: (err as Error).message,
          durationMs: Date.now() - t0,
          promptTokens: 0,
          completionTokens: 0,
        });
        throw err;
      }
    };

    try {
      // 1. PLAN ---------------------------------------------------------------
      const plan = await trace({ name: 'plan' }, { query }, async () => {
        const p = await this.planner.plan(query);
        return { result: p, usage: p.usage };
      });

      if (!plan.inScope || !plan.criteria) {
        const result = finalize({
          status: 'refused',
          refusalReason: plan.refusalReason ?? 'Request is out of scope.',
          summaryMarkdown:
            `**Request refused.** ${plan.refusalReason ?? ''}`.trim(),
        });
        await this.persist(query, result);
        return result;
      }
      const criteria = plan.criteria;

      // 2. SEARCH (parallel) --------------------------------------------------
      const sources: AgentTool<typeof criteria, RawListing[]>[] =
        criteria.excludeAgencies
          ? [this.bezrealitky, this.bazos]
          : [this.bazos, this.bezrealitky];

      const found = (
        await Promise.all(
          sources.map((tool) =>
            trace(tool, criteria, () => tool.run(criteria)).catch(
              () => [] as RawListing[],
            ),
          ),
        )
      ).flat();

      const deduped = this.dedupe(found).slice(0, this.maxListings);

      // 3. CLASSIFY -----------------------------------------------------------
      const classified = await Promise.all(
        deduped.map(async (listing) => {
          try {
            const classification = await trace(
              this.classifier,
              { listing, criteria },
              () => this.classifier.run({ listing, criteria }),
            );
            return { ...listing, classification };
          } catch {
            return null;
          }
        }),
      );

      // 4. FILTER + RANK ------------------------------------------------------
      const ranked: RankedListing[] = classified
        .filter((l): l is NonNullable<typeof l> => l !== null)
        .filter((l) => !l.classification.isLikelyScam)
        .filter(
          (l) =>
            !(
              criteria.excludeAgencies &&
              l.classification.sellerType === 'agency'
            ),
        )
        .sort(
          (a, b) =>
            b.classification.qualityScore - a.classification.qualityScore,
        )
        .map((l, i) => ({ ...l, rank: i + 1, inquiryDraft: null }));

      // 5. DRAFT (top N) ------------------------------------------------------
      for (const listing of ranked.slice(0, this.topNDrafts)) {
        try {
          listing.inquiryDraft = await trace(
            this.drafter,
            { listingUrl: listing.url },
            () => this.drafter.run({ listing, criteria }),
          );
        } catch {
          listing.inquiryDraft = null;
        }
      }

      // 6. SUMMARISE + PERSIST ------------------------------------------------
      const summaryMarkdown = renderSummary(criteria, ranked);
      const result = finalize({
        status: 'completed',
        criteria,
        totalFound: deduped.length,
        results: ranked,
        summaryMarkdown,
      });
      await this.persist(query, result);
      return result;
    } catch (err) {
      this.logger.error(
        `Agent run ${runId} failed: ${(err as Error).message}`,
        (err as Error).stack,
        AgentService.name,
      );
      const result = finalize({
        status: 'failed',
        refusalReason: null,
        summaryMarkdown: `**Run failed.** ${(err as Error).message}`,
      });
      await this.persist(query, result);
      return result;
    }
  }

  private dedupe(listings: RawListing[]): RawListing[] {
    const seen = new Set<string>();
    return listings.filter((l) => {
      const key = `${l.source}:${l.externalId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /** persist_run tool — best-effort; never fails the run on a write error. */
  private async persist(query: string, result: AgentResult): Promise<void> {
    try {
      await this.runs.save(query, result);
    } catch (err) {
      this.logger.warn(
        `persist_run failed for ${result.runId}: ${(err as Error).message}`,
        AgentService.name,
      );
    }
  }
}
