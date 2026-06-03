import { AgentService } from './agent.service';
import { SearchCriteria } from './schemas/criteria.schema';
import { RawListing } from './schemas/listing.schema';

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

const listing = (id: string, source: 'bazos' | 'bezrealitky'): RawListing => ({
  source,
  externalId: id,
  url: `https://example.com/${source}/${id}`,
  title: `Byt 2+kk ${id}`,
  description: '',
  priceCzk: 20000,
  disposition: '2+kk',
  areaM2: 50,
  location: 'Praha 5',
  postedBy: 'owner',
  images: [],
  scrapedAt: new Date().toISOString(),
});

function build(plannerResult: any) {
  const config = {
    get: (k: string) => (k === 'agent.maxListings' ? 40 : 3),
  } as any;
  const logger = { warn: jest.fn(), error: jest.fn(), log: jest.fn() } as any;
  const planner = { plan: jest.fn().mockResolvedValue(plannerResult) } as any;
  const usage = { promptTokens: 5, completionTokens: 5 };

  const bezrealitky = {
    name: 'search_bezrealitky',
    run: jest.fn().mockResolvedValue({
      result: [listing('a', 'bezrealitky')],
      usage: { promptTokens: 0, completionTokens: 0 },
    }),
  } as any;
  const bazos = {
    name: 'search_bazos',
    run: jest.fn().mockResolvedValue({
      result: [listing('b', 'bazos')],
      usage: { promptTokens: 0, completionTokens: 0 },
    }),
  } as any;
  const classifier = {
    name: 'classify_listing',
    run: jest.fn().mockResolvedValue({
      result: {
        sellerType: 'private',
        isLikelyScam: false,
        qualityScore: 80,
        reasons: ['fits'],
      },
      usage,
    }),
  } as any;
  const drafter = {
    name: 'draft_inquiry',
    run: jest
      .fn()
      .mockResolvedValue({ result: 'Dobrý den, mám zájem...', usage }),
  } as any;
  const runs = { save: jest.fn().mockResolvedValue(undefined) } as any;

  const service = new AgentService(
    config,
    logger,
    planner,
    bazos,
    bezrealitky,
    classifier,
    drafter,
    runs,
  );
  return { service, runs, classifier, drafter };
}

describe('AgentService (e2e loop, LLM mocked)', () => {
  it('runs the full pipeline and records traces', async () => {
    const { service, runs } = build({
      inScope: true,
      refusalReason: null,
      criteria,
      usage: { promptTokens: 10, completionTokens: 10 },
    });

    const result = await service.run('2+kk Praha 5 do 25000, bez realitky');

    expect(result.status).toBe('completed');
    expect(result.totalFound).toBe(2);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].rank).toBe(1);
    expect(result.results[0].inquiryDraft).toContain('Dobrý den');
    expect(result.usage.totalTokens).toBeGreaterThan(0);

    // trace: plan + 2 searches + 2 classify + drafts
    const toolsTraced = result.traces.map((t) => t.tool);
    expect(toolsTraced).toContain('plan');
    expect(toolsTraced).toContain('search_bezrealitky');
    expect(toolsTraced).toContain('classify_listing');
    expect(toolsTraced).toContain('draft_inquiry');
    expect(runs.save).toHaveBeenCalledTimes(1);
  });

  it('refuses out-of-scope requests without searching', async () => {
    const { service, classifier } = build({
      inScope: false,
      refusalReason: 'Not a Czech property search.',
      criteria: null,
      usage: { promptTokens: 4, completionTokens: 4 },
    });

    const result = await service.run('write me a poem');

    expect(result.status).toBe('refused');
    expect(result.refusalReason).toContain('Not a Czech property search');
    expect(classifier.run).not.toHaveBeenCalled();
  });

  it('drops scam and agency listings when excludeAgencies is set', async () => {
    const { service, classifier } = build({
      inScope: true,
      refusalReason: null,
      criteria,
      usage: { promptTokens: 1, completionTokens: 1 },
    });
    classifier.run
      .mockResolvedValueOnce({
        result: {
          sellerType: 'agency',
          isLikelyScam: false,
          qualityScore: 90,
          reasons: [],
        },
        usage: { promptTokens: 1, completionTokens: 1 },
      })
      .mockResolvedValueOnce({
        result: {
          sellerType: 'private',
          isLikelyScam: true,
          qualityScore: 90,
          reasons: [],
        },
        usage: { promptTokens: 1, completionTokens: 1 },
      });

    const result = await service.run('2+kk Praha bez realitky');
    expect(result.results).toHaveLength(0);
  });
});
