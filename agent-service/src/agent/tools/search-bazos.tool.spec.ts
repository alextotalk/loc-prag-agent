import { SearchBazosTool } from './search-bazos.tool';
import { SearchCriteria } from '../schemas/criteria.schema';

const FIXTURE = `
<div class="inzeraty">
  <div class="nadpis"><a href="/inzerat/123/byt-2kk-praha.php">Pronájem bytu 2+kk Praha 5</a></div>
  <div class="inzeratycena"><b>18 500 Kč</b></div>
  <div class="inzeratylok">Praha 5 - Smíchov</div>
  <div class="popis">Hezký byt blízko metra.</div>
</div>
<div class="inzeraty">
  <div class="nadpis"><a href="https://reality.bazos.cz/inzerat/456/byt.php">Pronájem 2+kk</a></div>
  <div class="inzeratycena"><b>Info v textu</b></div>
  <div class="inzeratylok">Praha 5</div>
  <div class="popis">Druhý inzerát.</div>
</div>`;

/** Subclass to inject fixture HTML instead of hitting the network. */
class TestableBazos extends SearchBazosTool {
  protected async fetchHtml(): Promise<string> {
    return FIXTURE;
  }
}

const criteria: SearchCriteria = {
  dealType: 'rent',
  dispositions: ['2+kk'],
  city: 'Praha',
  district: 'Praha 5',
  priceMax: 25000,
  nearMetro: true,
  excludeAgencies: false,
  keywords: [],
};

describe('SearchBazosTool', () => {
  it('builds a rent search URL with price bound', () => {
    const tool = new SearchBazosTool();
    const url = tool.buildUrl(criteria);
    expect(url).toContain('reality.bazos.cz/pronajmu');
    expect(url).toContain('cenado=25000');
  });

  it('parses listings from fixture HTML', () => {
    const tool = new SearchBazosTool();
    const listings = tool.parse(FIXTURE);
    expect(listings).toHaveLength(2);
    expect(listings[0]).toMatchObject({
      source: 'bazos',
      externalId: 'byt-2kk-praha.php',
      priceCzk: 18500,
      location: 'Praha 5 - Smíchov',
    });
    expect(listings[0].url).toContain('https://reality.bazos.cz/inzerat/123');
    expect(listings[1].priceCzk).toBeNull();
  });

  it('returns parsed listings via run()', async () => {
    const tool = new TestableBazos();
    const { result } = await tool.run(criteria);
    expect(result).toHaveLength(2);
  });
});
