import { SearchBezrealitkyTool } from './search-bezrealitky.tool';
import { SearchCriteria } from '../schemas/criteria.schema';

const criteria: SearchCriteria = {
  dealType: 'rent',
  dispositions: ['2+kk'],
  city: 'Praha',
  district: 'Praha 5',
  priceMax: 25000,
  priceMin: 10000,
  minArea: 40,
  nearMetro: true,
  excludeAgencies: true,
  keywords: [],
};

const FIXTURE = {
  listAdverts: {
    totalCount: 3,
    list: [
      {
        id: '609391',
        uri: '609391-nabidka-pronajem-bytu-svatosovych-praha',
        title: 'Pronájem bytu 2+kk',
        address: 'Svatošových, Praha - Vysočany',
        price: 22100,
        currency: 'CZK',
        surface: 48,
        disposition: 'DISP_2_KK',
      },
      {
        id: '1028221',
        uri: '1028221-nabidka-pronajem-bytu-pradlacka-brno',
        title: 'Pronájem bytu 2+kk',
        address: 'Přadlácká, Brno - Zábrdovice',
        price: 17700,
        currency: 'CZK',
        surface: 50,
        disposition: 'DISP_2_KK',
      },
      {
        id: '1029953',
        uri: '1029953-bratislava',
        title: 'Prenájom bytu',
        address: 'Kadnárova, Rača, Bratislavský kraj',
        price: 655,
        currency: 'EUR',
        surface: 55,
        disposition: 'DISP_2_IZB',
      },
    ],
  },
};

class TestableBezrealitky extends SearchBezrealitkyTool {
  protected async fetchGql(): Promise<any> {
    return FIXTURE;
  }
}

describe('SearchBezrealitkyTool', () => {
  it('maps our criteria to the live GraphQL enum variables', () => {
    const tool = new SearchBezrealitkyTool();
    const vars = tool.buildVars(criteria);
    expect(vars).toMatchObject({
      offerType: ['PRONAJEM'],
      estateType: ['BYT'],
      disposition: ['DISP_2_KK'],
      priceFrom: 10000,
      priceTo: 25000,
      surfaceFrom: 40,
    });
  });

  it('drops EUR (Slovak) listings and maps nodes to RawListing', () => {
    const tool = new SearchBezrealitkyTool();
    const a = tool.mapNode(FIXTURE.listAdverts.list[0])!;
    expect(a).toMatchObject({
      source: 'bezrealitky',
      externalId: '609391',
      priceCzk: 22100,
      areaM2: 48,
      disposition: 'DISP_2_KK',
      postedBy: 'owner',
    });
    expect(a.url).toBe(
      'https://www.bezrealitky.cz/nemovitosti-byty-domy/609391-nabidka-pronajem-bytu-svatosovych-praha',
    );
    expect(tool.mapNode(FIXTURE.listAdverts.list[2])).toBeNull(); // EUR
  });

  it('filters results to the requested city via run()', async () => {
    const tool = new TestableBezrealitky();
    const { result } = await tool.run(criteria);
    // Praha kept, Brno filtered out, Bratislava (EUR) dropped
    expect(result).toHaveLength(1);
    expect(result[0].location).toContain('Praha');
  });
});
