// Finviz quote page scraper — earnings date + market cap
// Parses the snapshot table from the Finviz quote page

const FINVIZ_BASE = '/api/finviz';

/**
 * Fetch snapshot data for a single ticker from Finviz quote page.
 * Returns { earnings, marketCap } where:
 *   earnings: { date, daysUntil, timing } or null
 *   marketCap: raw number (e.g. 548230000000) or null
 */
export async function fetchFinvizSnapshot(ticker) {
  try {
    const url = `${FINVIZ_BASE}/quote.ashx?t=${encodeURIComponent(ticker)}&ty=c&ta=0&p=d`;
    const res = await fetch(url);
    if (!res.ok) return { earnings: null, marketCap: null };

    const html = await res.text();

    return {
      earnings: parseEarnings(html),
      marketCap: parseMarketCap(html),
    };
  } catch {
    return { earnings: null, marketCap: null };
  }
}

// Keep the old export name working
export async function fetchEarningsForTicker(ticker) {
  const snap = await fetchFinvizSnapshot(ticker);
  return snap.earnings;
}

// ---------------------------------------------------------------------------
// Earnings parser
// ---------------------------------------------------------------------------

function parseEarnings(html) {
  const match = html.match(
    />\s*Earnings\s*<\/a>\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td/i
  );
  if (!match) return null;

  const raw = match[1].replace(/<[^>]+>/g, '').trim();
  if (!raw || raw === '-') return null;

  const dateMatch = raw.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s*(AMC|BMO)?$/i);
  if (!dateMatch) return null;

  const [, monthStr, dayStr, timing] = dateMatch;
  const monthNames = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const month = monthNames[monthStr];
  const day = parseInt(dayStr, 10);

  const now = new Date();
  const year = now.getFullYear();
  const earningsDate = new Date(year, month, day);
  const daysUntil = Math.ceil((earningsDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

  if (daysUntil < -5) return null;

  return {
    date: earningsDate.toISOString().slice(0, 10),
    daysUntil,
    timing: timing?.toUpperCase() || null,
  };
}

// ---------------------------------------------------------------------------
// Market Cap parser
// ---------------------------------------------------------------------------

function parseMarketCap(html) {
  // Finviz snapshot: >Market Cap</td><td ...><b>548.23B</b></td>
  // Finviz: ">Market Cap</td><td ...><b>519.64B</b></td>
  const match = html.match(
    />\s*Market Cap\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td/i
  );
  if (!match) return null;

  const raw = match[1].replace(/<[^>]+>/g, '').trim();
  if (!raw || raw === '-') return null;

  const mcMatch = raw.match(/^([\d.]+)([TBMK])?$/i);
  if (!mcMatch) return null;

  const num = parseFloat(mcMatch[1]);
  const suffix = (mcMatch[2] || '').toUpperCase();
  const mult = suffix === 'T' ? 1e12 : suffix === 'B' ? 1e9 : suffix === 'M' ? 1e6 : suffix === 'K' ? 1e3 : 1;
  return num * mult;
}
