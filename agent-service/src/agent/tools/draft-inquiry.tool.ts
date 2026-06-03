import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { SearchCriteria } from '../schemas/criteria.schema';
import { RawListing } from '../schemas/listing.schema';
import { OpenAiService } from '../llm/openai.service';
import { AgentTool, ToolRunResult } from './tool.types';

export interface DraftArgs {
  listing: RawListing;
  criteria: SearchCriteria;
}

const DraftSchema = z.object({
  message: z
    .string()
    .min(20)
    .describe('the Czech inquiry message, ready to send'),
});

/**
 * LLM tool: drafts a short, polite Czech-language inquiry message to the
 * seller for a top-ranked listing, personalised to the user's criteria.
 */
@Injectable()
export class DraftInquiryTool implements AgentTool<DraftArgs, string> {
  readonly name = 'draft_inquiry';
  readonly description =
    'Draft a polite Czech inquiry message to the seller for a listing.';

  constructor(private readonly openai: OpenAiService) {}

  async run(args: DraftArgs): Promise<ToolRunResult<string>> {
    const { listing, criteria } = args;
    const system = [
      'You write short, polite inquiry messages in CZECH to property sellers.',
      '3-5 sentences. Greet, state interest in the specific property,',
      'mention 1-2 relevant needs from the criteria, ask about availability/viewing,',
      'and sign off neutrally. No placeholders like [name]. Return JSON {message}.',
    ].join(' ');

    const user = JSON.stringify({
      criteria,
      listing: {
        title: listing.title,
        location: listing.location,
        priceCzk: listing.priceCzk,
      },
    });

    const { data, usage } = await this.openai.completeStructured({
      system,
      user,
      schema: DraftSchema,
      schemaName: 'inquiry_draft',
      temperature: 0.5,
    });

    return { result: data.message, usage };
  }
}
