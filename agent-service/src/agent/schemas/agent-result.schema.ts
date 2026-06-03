import { z } from 'zod';
import { SearchCriteriaSchema } from './criteria.schema';
import { RankedListingSchema } from './listing.schema';

/** One recorded tool invocation for observability (also persisted to Mongo). */
export const ToolTraceSchema = z.object({
  step: z.number().int().nonnegative(),
  tool: z.string(),
  args: z.unknown(),
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: z.string().optional(),
  durationMs: z.number().nonnegative(),
  promptTokens: z.number().int().nonnegative().default(0),
  completionTokens: z.number().int().nonnegative().default(0),
});

export type ToolTrace = z.infer<typeof ToolTraceSchema>;

/** The full structured result returned by the agent for one run. */
export const AgentResultSchema = z.object({
  runId: z.string(),
  status: z.enum(['completed', 'refused', 'failed']),
  refusalReason: z.string().nullable().default(null),
  criteria: SearchCriteriaSchema.nullable(),
  totalFound: z.number().int().nonnegative().default(0),
  results: z.array(RankedListingSchema).default([]),
  summaryMarkdown: z.string().default(''),
  traces: z.array(ToolTraceSchema).default([]),
  usage: z.object({
    promptTokens: z.number().int().nonnegative().default(0),
    completionTokens: z.number().int().nonnegative().default(0),
    totalTokens: z.number().int().nonnegative().default(0),
  }),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  durationMs: z.number().nonnegative(),
});

export type AgentResult = z.infer<typeof AgentResultSchema>;
