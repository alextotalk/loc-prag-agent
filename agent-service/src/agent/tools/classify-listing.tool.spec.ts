import { ClassifyListingTool } from './classify-listing.tool';
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
  source: 'bazos',
  externalId: '123',
  url: 'https://reality.bazos.cz/inzerat/123/byt.php',
  title: '2+kk Praha 5 Anděl',
  description: 'Pěkný byt u metra.',
  priceCzk: 22000,
  disposition: '2+kk',
  areaM2: 50,
  location: 'Praha 5',
  postedBy: '',
  images: [],
  scrapedAt: new Date().toISOString(),
};

describe('ClassifyListingTool', () => {
  it('passes criteria+listing to the LLM and returns the validated verdict', async () => {
    const completeStructured = jest.fn().mockResolvedValue({
      data: {
        sellerType: 'private',
        isLikelyScam: false,
        qualityScore: 88,
        reasons: ['matches disposition', 'within budget'],
      },
      usage: { promptTokens: 120, completionTokens: 40 },
    });
    const openai = { completeStructured } as unknown as OpenAiService;
    const tool = new ClassifyListingTool(openai);

    const { result, usage } = await tool.run({ listing, criteria });

    expect(result.sellerType).toBe('private');
    expect(result.qualityScore).toBe(88);
    expect(usage).toEqual({ promptTokens: 120, completionTokens: 40 });

    // the user payload must carry both the criteria and the listing
    const call = completeStructured.mock.calls[0][0];
    expect(call.schemaName).toBe('listing_classification');
    expect(call.user).toContain('Praha 5');
    expect(call.user).toContain('Anděl');
  });
});
