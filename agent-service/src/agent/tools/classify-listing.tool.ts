import { Injectable } from '@nestjs/common';
import { SearchCriteria } from '../schemas/criteria.schema';
import {
  ListingClassification,
  ListingClassificationSchema,
  RawListing,
} from '../schemas/listing.schema';
import { OpenAiService } from '../llm/openai.service';
import { AgentTool, ToolRunResult } from './tool.types';

export interface ClassifyArgs {
  listing: RawListing;
  criteria: SearchCriteria;
}

/**
 * LLM tool: judges a single listing against the criteria — seller type
 * (private/agency), scam likelihood, and a 0-100 quality/fit score with
 * short justifications. Output is Zod-validated.
 */
@Injectable()
export class ClassifyListingTool implements AgentTool<
  ClassifyArgs,
  ListingClassification
> {
  readonly name = 'classify_listing';
  readonly description =
    'Classify a listing: seller type, scam risk, and quality/fit score.';

  constructor(private readonly openai: OpenAiService) {}

  async run(args: ClassifyArgs): Promise<ToolRunResult<ListingClassification>> {
    const { listing, criteria } = args;
    const system = [
      'You are a Czech real-estate expert assistant.',
      'Classify the listing strictly as JSON matching the schema.',
      'sellerType: "agency" if it reads like a realitní kancelář / broker, "private" if owner, else "unknown".',
      'isLikelyScam: true for too-good-to-be-true price, advance-payment requests, or vague/duplicated text.',
      'qualityScore: 0-100 how well it fits the criteria (location, price, disposition, area, keywords).',
      'reasons: 1-4 short bullet strings.',
    ].join(' ');

    const user = JSON.stringify({ criteria, listing });

    const { data, usage } = await this.openai.completeStructured({
      system,
      user,
      schema: ListingClassificationSchema,
      schemaName: 'listing_classification',
    });

    return { result: data, usage };
  }
}
