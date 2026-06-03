import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { SearchCriteria } from '../schemas/criteria.schema';
import { RawListing, RawListingSchema } from '../schemas/listing.schema';
import { AgentTool, ToolRunResult, ZERO_USAGE } from './tool.types';

/**
 * Scrapes bazos.cz (reality section) for listings matching the criteria.
 *
 * NOTE: bazos markup is plain server-rendered HTML. The CSS selectors below
 * target the current listing layout (`.inzeraty`). They are the single point
 * that must be re-verified against live HTML — kept isolated in `parse()` so a
 * markup change is a one-method fix and unit tests can feed fixture HTML.
 */
@Injectable()
export class SearchBazosTool implements AgentTool<
  SearchCriteria,
  RawListing[]
> {
  readonly name = 'search_bazos';
  readonly description =
    'Search bazos.cz real-estate listings by city/price/disposition.';

  private readonly logger = new Logger(SearchBazosTool.name);
  private readonly baseUrl = 'https://reality.bazos.cz';

  async run(args: SearchCriteria): Promise<ToolRunResult<RawListing[]>> {
    const url = this.buildUrl(args);
    try {
      const html = await this.fetchHtml(url);
      const listings = this.parse(html);
      return { result: listings, usage: ZERO_USAGE };
    } catch (err) {
      this.logger.warn(
        `bazos fetch failed for ${url}: ${(err as Error).message}`,
      );
      return { result: [], usage: ZERO_USAGE };
    }
  }

  /** Builds a bazos search URL from criteria. */
  buildUrl(c: SearchCriteria): string {
    const section = c.dealType === 'sale' ? 'prodam' : 'pronajmu';
    const q = encodeURIComponent(
      [c.dispositions[0], c.district ?? c.city].filter(Boolean).join(' '),
    );
    const params = new URLSearchParams();
    if (c.priceMin) params.set('cenaod', String(c.priceMin));
    if (c.priceMax) params.set('cenado', String(c.priceMax));
    const qs = params.toString();
    return `${this.baseUrl}/${section}/?hledat=${q}${qs ? `&${qs}` : ''}`;
  }

  /** Overridable for tests (inject fixture HTML instead of hitting network). */
  protected async fetchHtml(url: string): Promise<string> {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; loc-prag-agent/0.1)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }

  /** Parses bazos listing HTML into RawListing[]. */
  parse(html: string): RawListing[] {
    const $ = cheerio.load(html);
    const now = new Date().toISOString();
    const out: RawListing[] = [];

    $('.inzeraty').each((_, el) => {
      const $el = $(el);
      const $link = $el.find('.nadpis a').first();
      const href = $link.attr('href');
      if (!href) return;
      const url = href.startsWith('http') ? href : `${this.baseUrl}${href}`;
      const priceText = $el.find('.inzeratycena b').first().text();
      const priceCzk = this.parsePrice(priceText);
      const externalId = url.split('/').filter(Boolean).pop() ?? url;

      const candidate = {
        source: 'bazos' as const,
        externalId,
        url,
        title: $link.text().trim(),
        description: $el.find('.popis').text().trim(),
        priceCzk,
        disposition: null,
        areaM2: null,
        location: $el.find('.inzeratylok').text().trim(),
        postedBy: '',
        images: [],
        scrapedAt: now,
      };
      const safe = RawListingSchema.safeParse(candidate);
      if (safe.success) out.push(safe.data);
    });

    return out;
  }

  private parsePrice(text: string): number | null {
    const digits = text.replace(/\D+/g, '');
    return digits ? parseInt(digits, 10) : null;
  }
}
