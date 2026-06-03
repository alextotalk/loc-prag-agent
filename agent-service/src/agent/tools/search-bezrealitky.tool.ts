import { Injectable, Logger } from '@nestjs/common';
import { SearchCriteria } from '../schemas/criteria.schema';
import { RawListing, RawListingSchema } from '../schemas/listing.schema';
import { AgentTool, ToolRunResult, ZERO_USAGE } from './tool.types';

/** Maps our disposition labels to bezrealitky's Disposition enum values. */
const DISPOSITION_MAP: Record<string, string> = {
  '1+kk': 'DISP_1_KK',
  '1+1': 'DISP_1_1',
  '2+kk': 'DISP_2_KK',
  '2+1': 'DISP_2_1',
  '3+kk': 'DISP_3_KK',
  '3+1': 'DISP_3_1',
  '4+kk': 'DISP_4_KK',
  '4+1': 'DISP_4_1',
  '5+kk': 'DISP_5_KK',
  other: 'OSTATNI',
};

/**
 * Queries bezrealitky.cz via its public GraphQL API. bezrealitky is an
 * owner-only ("no agencies") marketplace, which makes it the natural source
 * when `excludeAgencies` is set.
 *
 * The GraphQL shape below was verified against the live endpoint
 * (`api.bezrealitky.cz/graphql/`): `listAdverts` takes list-typed enum filters
 * (`[OfferType]`, `[EstateType]`, `[Disposition]`), `priceFrom/priceTo`,
 * `surfaceFrom`, `limit`, `order`. The endpoint requires browser-like headers
 * (Origin/Referer) or it returns 403. `address` needs a `locale` arg.
 *
 * The API is not filtered by region without an OSM region id, so we over-fetch
 * recent matches and filter by city on the client side; finer location fit is
 * left to the LLM classifier/ranking.
 */
@Injectable()
export class SearchBezrealitkyTool implements AgentTool<
  SearchCriteria,
  RawListing[]
> {
  readonly name = 'search_bezrealitky';
  readonly description =
    'Search bezrealitky.cz (owner-only marketplace) via its GraphQL API.';

  private readonly logger = new Logger(SearchBezrealitkyTool.name);
  private readonly endpoint = 'https://api.bezrealitky.cz/graphql/';
  private readonly listingBase =
    'https://www.bezrealitky.cz/nemovitosti-byty-domy';

  async run(args: SearchCriteria): Promise<ToolRunResult<RawListing[]>> {
    try {
      const data = await this.fetchGql(this.buildQuery(), this.buildVars(args));
      const nodes = data?.listAdverts?.list ?? [];
      const listings = nodes
        .map((n: unknown) => this.mapNode(n))
        .filter((l: RawListing | null): l is RawListing => l !== null)
        .filter((l: RawListing) => this.matchesCity(l, args));
      return { result: listings, usage: ZERO_USAGE };
    } catch (err) {
      this.logger.warn(`bezrealitky query failed: ${(err as Error).message}`);
      return { result: [], usage: ZERO_USAGE };
    }
  }

  buildQuery(): string {
    return /* GraphQL */ `
      query ListAdverts(
        $offerType: [OfferType]
        $estateType: [EstateType]
        $disposition: [Disposition]
        $priceFrom: Int
        $priceTo: Int
        $surfaceFrom: Int
        $limit: Int
      ) {
        listAdverts(
          offerType: $offerType
          estateType: $estateType
          disposition: $disposition
          priceFrom: $priceFrom
          priceTo: $priceTo
          surfaceFrom: $surfaceFrom
          limit: $limit
          order: TIMEORDER_DESC
        ) {
          totalCount
          list {
            id
            uri
            title
            address(locale: CS)
            price
            currency
            surface
            disposition
          }
        }
      }
    `;
  }

  buildVars(c: SearchCriteria): Record<string, unknown> {
    const dispositions = c.dispositions
      .map((d) => DISPOSITION_MAP[d])
      .filter(Boolean);
    return {
      offerType: [c.dealType === 'sale' ? 'PRODEJ' : 'PRONAJEM'],
      estateType: ['BYT'],
      disposition: dispositions.length ? dispositions : undefined,
      priceFrom: c.priceMin,
      priceTo: c.priceMax,
      surfaceFrom: c.minArea,
      limit: 30,
    };
  }

  /** Overridable for tests (inject a fixture response instead of network). */
  protected async fetchGql(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<any> {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://www.bezrealitky.cz',
        Referer: 'https://www.bezrealitky.cz/',
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.errors) throw new Error(JSON.stringify(json.errors));
    return json.data;
  }

  mapNode(node: any): RawListing | null {
    if (!node?.id) return null;
    // Only keep CZK listings (the API also returns SK adverts priced in EUR).
    if (node.currency && node.currency !== 'CZK') return null;
    const uri = node.uri ?? node.id;
    const candidate = {
      source: 'bezrealitky' as const,
      externalId: String(node.id),
      url: String(uri).startsWith('http') ? uri : `${this.listingBase}/${uri}`,
      title: node.title ?? 'Bezrealitky listing',
      description: '',
      priceCzk: typeof node.price === 'number' ? node.price : null,
      disposition: node.disposition ?? null,
      areaM2: typeof node.surface === 'number' ? node.surface : null,
      location: node.address ?? '',
      postedBy: 'owner',
      images: [],
      scrapedAt: new Date().toISOString(),
    };
    const safe = RawListingSchema.safeParse(candidate);
    return safe.success ? safe.data : null;
  }

  /** Client-side city filter (API isn't region-filtered without an OSM id). */
  private matchesCity(l: RawListing, c: SearchCriteria): boolean {
    if (!c.city) return true;
    return l.location.toLowerCase().includes(c.city.toLowerCase());
  }
}
