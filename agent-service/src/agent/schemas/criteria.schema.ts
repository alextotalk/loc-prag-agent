import { z } from 'zod';

/**
 * Structured search criteria produced by the planner step from the user's
 * free-text request. This is the contract every search tool consumes.
 */
export const DispositionEnum = z.enum([
  '1+kk',
  '1+1',
  '2+kk',
  '2+1',
  '3+kk',
  '3+1',
  '4+kk',
  '4+1',
  '5+kk',
  'other',
]);

export const DealTypeEnum = z.enum(['rent', 'sale']);

export const SearchCriteriaSchema = z.object({
  dealType: DealTypeEnum.default('rent'),
  dispositions: z.array(DispositionEnum).default([]),
  city: z.string().min(1).describe('e.g. "Praha"'),
  district: z
    .string()
    .optional()
    .describe('e.g. "Praha 5" — optional sub-area'),
  priceMax: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('upper price bound in CZK'),
  priceMin: z.number().int().positive().optional(),
  minArea: z.number().int().positive().optional().describe('m²'),
  nearMetro: z.boolean().default(false),
  excludeAgencies: z
    .boolean()
    .default(false)
    .describe('true = only private/owner listings ("no agencies")'),
  keywords: z
    .array(z.string())
    .default([])
    .describe('extra free-text hints, e.g. "balkón", "pet friendly"'),
});

export type SearchCriteria = z.infer<typeof SearchCriteriaSchema>;
