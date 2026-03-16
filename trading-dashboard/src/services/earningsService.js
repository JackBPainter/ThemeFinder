// Earnings proximity service — Finviz quote page scraper
// Parses the "Earnings" field from the Finviz snapshot table (e.g. "Mar 18 AMC")

const FINVIZ_BASE = '/api/finviz';

/**
 * Fetch earnings date for a single ticker from Finviz quote page.
 * Returns { date, daysUntil, timing } or null if no upcoming earnings within 28 days.
 * timing is "AMC" (after market close), "BMO" (before market open), or null.
 */
export async function fetchEarningsForTicker(ticker) {
  console.log(`[earnings] Fetching for ${ticker}...`);
  try {
    const url = `${FINVIZ_BASE}/quote.ashx?t=${encodeURIComponent(ticker)}&ty=c&ta=0&p=d`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[earnings] ${ticker}: HTTP ${res.status}`);
      return null;
    }

    const html = await res.text();

    // Find the "Earnings" label in the snapshot table.
    // Actual HTML: >Earnings</a></td><td ...><a ...><b><small>Mar 18 AMC</small></b></a></td>
    // Match: >Earnings< then skip closing tags until the next <td>, capture its contents.
    const match = html.match(
      />\s*Earnings\s*<\/a>\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td/i
    );

    if (!match) {
      // Try to find any mention of "Earnings" to debug
      const idx = html.indexOf('>Earnings<');
      if (idx >= 0) {
        console.log(`[earnings] ${ticker}: found "Earnings" at ${idx}, context:`, html.substring(idx, idx + 200));
      } else {
        console.log(`[earnings] ${ticker}: no "Earnings" field found in ${html.length} bytes`);
      }
      return null;
    }

    // Strip HTML tags to get plain text like "Mar 18 AMC"
    const rawCell = match[1].replace(/<[^>]+>/g, '').trim();
    console.log(`[earnings] ${ticker}: raw="${rawCell}"`);

    if (!rawCell || rawCell === '-') return null;

    // Parse the date text — e.g. "Mar 18 AMC", "Apr 02 BMO", "Mar 18"
    const raw = match[1].replace(/<[^>]+>/g, '').trim();
    if (!raw || raw === '-') return null;

    // Extract month, day, and optional timing
    const dateMatch = raw.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s*(AMC|BMO)?$/i);
    if (!dateMatch) return null;

    const [, monthStr, dayStr, timing] = dateMatch;
    const monthNames = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
    const month = monthNames[monthStr];
    const day = parseInt(dayStr, 10);

    // Determine the year — if the date has already passed this year, it's next year
    const now = new Date();
    let year = now.getFullYear();
    const earningsDate = new Date(year, month, day);
    if (earningsDate.getTime() < now.getTime() - 7 * 24 * 60 * 60 * 1000) {
      // More than a week in the past — assume next year
      year += 1;
      earningsDate.setFullYear(year);
    }

    const daysUntil = Math.ceil((earningsDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    if (daysUntil < 0 || daysUntil > 28) return null;

    return {
      date: earningsDate.toISOString().slice(0, 10),
      daysUntil,
      timing: timing?.toUpperCase() || null,
    };
  } catch (err) {
    console.warn(`[earnings] ${ticker}: error`, err.message);
    return null;
  }
}
