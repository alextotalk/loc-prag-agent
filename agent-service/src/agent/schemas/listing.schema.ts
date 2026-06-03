import { z } from 'zod';

/** A raw listing as returned by a search tool, before classification. */
export const RawListingSchema = z.object({
  source: z.enum(['bazos', 'bezrealitky']),
  externalId: z.string(),
  url: z.string().url(),
  title: z.string(),
  description: z.string().default(''),
  priceCzk: z.number().int().nonnegative().nullable().default(null),
  disposition: z.string().nullable().default(null),
  areaM2: z.number().int().positive().nullable().default(null),
  location: z.string().default(''),
  postedBy: z.string().default('').describe('seller/contact name if available'),
  images: z.array(z.string().url()).default([]),
  scrapedAt: z.string().datetime(),
});

export type RawListing = z.infer<typeof RawListingSchema>;

/** Classification verdict produced by the classify_listing tool (LLM). */
export const ListingClassificationSchema = z.object({
  sellerType: z.enum(['private', 'agency', 'unknown']),
  isLikelyScam: z.boolean(),
  qualityScore: z
    .number()
    .min(0)
    .max(100)
    .describe('0-100 fit-and-quality score vs the criteria'),
  reasons: z.array(z.string()).describe('short bullet justifications'),
});

export type ListingClassification = z.infer<typeof ListingClassificationSchema>;

/** A listing enriched with classification + ranking, ready for output. */
export const RankedListingSchema = RawListingSchema.extend({
  classification: ListingClassificationSchema,
  rank: z.number().int().positive(),
  inquiryDraft: z.string().nullable().default(null),
});

export type RankedListing = z.infer<typeof RankedListingSchema>;
