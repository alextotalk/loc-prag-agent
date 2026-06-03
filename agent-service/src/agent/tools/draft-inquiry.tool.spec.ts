import { DraftInquiryTool } from './draft-inquiry.tool';
import { OpenAiService } from '../llm/openai.service';
import { SearchCriteria } from '../schemas/criteria.schema';
import { RawListing } from '../schemas/listing.schema';

const criteria: SearchCriteria = {
  dealType: 'rent',
  dispositions: ['2+kk'],
  city: 'Praha',
  district: 'Praha 5',
  priceMax: 25000,
  nearMetro: true,
  excludeAgencies: true,
  keywords: [],
};

const listing: RawListing = {
  source: 'bezrealitky',
  externalId: '609391',
  url: 'https://www.bezrealitky.cz/nemovitosti-byty-domy/609391-x',
  title: 'Pronájem bytu 2+kk Anděl',
  description: '',
  priceCzk: 22100,
  disposition: 'DISP_2_KK',
  areaM2: 48,
  location: 'Svatošových, Praha - Vysočany',
  postedBy: 'owner',
  images: [],
  scrapedAt: new Date().toISOString(),
};

describe('DraftInquiryTool', () => {
  it('returns the drafted Czech message string and its token usage', async () => {
    const completeStructured = jest.fn().mockResolvedValue({
      data: { message: 'Dobrý den, mám zájem o pronájem bytu 2+kk...' },
      usage: { promptTokens: 90, completionTokens: 60 },
    });
    const openai = { completeStructured } as unknown as OpenAiService;
    const tool = new DraftInquiryTool(openai);

    const { result, usage } = await tool.run({ listing, criteria });

    expect(result).toContain('Dobrý den');
    expect(usage).toEqual({ promptTokens: 90, completionTokens: 60 });

    const call = completeStructured.mock.calls[0][0];
    expect(call.schemaName).toBe('inquiry_draft');
    expect(call.temperature).toBeGreaterThan(0); // some creativity for drafting
  });
});
