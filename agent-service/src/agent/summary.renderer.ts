import { SearchCriteria } from './schemas/criteria.schema';
import { RankedListing } from './schemas/listing.schema';

/** Renders a human-readable Markdown summary alongside the structured JSON. */
export function renderSummary(
  criteria: SearchCriteria,
  ranked: RankedListing[],
): string {
  const lines: string[] = [];
  const price = criteria.priceMax
    ? ` up to ${criteria.priceMax.toLocaleString('cs-CZ')} CZK`
    : '';
  const disp = criteria.dispositions.length
    ? criteria.dispositions.join('/') + ' '
    : '';
  const where = criteria.district ?? criteria.city;

  lines.push(
    `## ${disp}${criteria.dealType === 'sale' ? 'for sale' : 'to rent'} in ${where}${price}`,
  );
  lines.push('');

  if (ranked.length === 0) {
    lines.push('_No matching listings found after filtering._');
    return lines.join('\n');
  }

  lines.push(`Found **${ranked.length}** matching listing(s). Top results:`);
  lines.push('');

  for (const l of ranked.slice(0, 10)) {
    const p = l.priceCzk
      ? `${l.priceCzk.toLocaleString('cs-CZ')} CZK`
      : 'price n/a';
    lines.push(
      `**${l.rank}. ${l.title}** — ${p} · ${l.classification.sellerType} · score ${l.classification.qualityScore}/100`,
    );
    if (l.location) lines.push(`   ${l.location}`);
    lines.push(`   ${l.url}`);
    if (l.inquiryDraft) {
      lines.push('   > _Draft inquiry:_');
      lines.push(...l.inquiryDraft.split('\n').map((line) => `   > ${line}`));
    }
    lines.push('');
  }

  return lines.join('\n');
}
