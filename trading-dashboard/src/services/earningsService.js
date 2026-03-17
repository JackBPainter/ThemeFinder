// Earnings proximity service — Finviz quote page scraper
// Parses the "Earnings" field from the Finviz snapshot table (e.g. "Mar 18 AMC")

const FINVIZ_BASE = '/api/finviz';

/**
 * Fetch earnings date for a single ticker from Finviz quote page.
 * Returns { date, daysUntil, timing } or null if no upcoming earnings found.
 * timing is "AMC" (after market close), "BMO" (before market open), or null.
 */
export async function fetchEarningsForTicker(ticker) {
  try {
    const url = `${FINVIZ_BASE}/quote.ashx?t=${encodeURIComponent(ticker)}&ty=c&ta=0&p=d`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const html = await res.text();

    // Find the "Earnings" label in the snapshot table.
    // HTML: >Earnings</a></td><td ...><a ...><b><small>Mar 18 AMC</small></b></a></td>
    const match = html.match(
      />\s*Earnings\s*<\/a>\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td/i
    );
    if (!match) return null;

    // Strip HTML tags to get plain text like "Mar 18 AMC"
    const raw = match[1].replace(/<[^>]+>/g, '').trim();
    if (!raw || raw === '-') return null;

    // Extract month, day, and optional timing
    const dateMatch = raw.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s*(AMC|BMO)?$/i);
    if (!dateMatch) return null;

    const [, monthStr, dayStr, timing] = dateMatch;
    const monthNames = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
    const month = monthNames[monthStr];
    const day = parseInt(dayStr, 10);

    // Determine the year.
    // Finviz shows only month + day. We assume the current year first.
    // If the date is in the past by more than 3 days, it's a PAST earnings report — skip it.
    // If it's within 3 days in the past (just reported), still show it.
    const now = new Date();
    const year = now.getFullYear();
    const earningsDate = new Date(year, month, day);
    const daysUntil = Math.ceil((earningsDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

    // Past by more than 3 days = last quarter's earnings, not upcoming
    if (daysUntil < -3) return null;

    return {
      date: earningsDate.toISOString().slice(0, 10),
      daysUntil,
      timing: timing?.toUpperCase() || null,
    };
  } catch {
    return null;
  }
}
