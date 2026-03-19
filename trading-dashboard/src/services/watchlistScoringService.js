// Watchlist Scoring Pipeline
// Consumes Finviz theme/sector data + Yahoo Finance per-ticker data
// to produce a ranked daily watchlist of high-conviction swing-trade candidates.

import { getStockPerformance } from './yahooFinanceApi';
import { fetchFinvizSnapshot } from './earningsService';

const FINVIZ_BASE = '/api/finviz';

const TIMEFRAMES = [
  { key: 'd1',  st: '',    short: '1D' },
  { key: 'w1',  st: 'w1',  short: '1W' },
  { key: 'w4',  st: 'w4',  short: '1M' },
  { key: 'w13', st: 'w13', short: '3M' },
  { key: 'w26', st: 'w26', short: '6M' },
  { key: 'w52', st: 'w52', short: '1Y' },
];

// Aggressive preset: heaviest on 1D/1W for fast momentum
const AGGRESSIVE_WEIGHTS = { d1: 4, w1: 3, w4: 1, w13: 0, w26: 0, w52: 0 };

// Sector categories for stop-loss sizing
const TIGHT_STOP_SECTORS = ['financials', 'industrials', 'utilities', 'real_estate', 'consumer_defensive'];
const WIDE_STOP_SECTORS = ['biotechnology', 'drug_manufacturers', 'semiconductors', 'software', 'internet'];

// ---------------------------------------------------------------------------
// Finviz data fetching (same pattern as ThemeFinder)
// ---------------------------------------------------------------------------

async function fetchDefinitions() {
  const mapRes = await fetch(`${FINVIZ_BASE}/map.ashx?t=themes`);
  if (!mapRes.ok) throw new Error(`Finviz map page returned ${mapRes.status}`);
  const mapHtml = await mapRes.text();

  const chunkMatch = mapHtml.match(/href="(\/assets\/dist\/map_base_themes[^"]+\.js)"/);
  if (!chunkMatch) throw new Error('Could not locate themes data chunk');

  const chunkRes = await fetch(`${FINVIZ_BASE}${chunkMatch[1]}`);
  if (!chunkRes.ok) throw new Error('Could not load themes definitions chunk');
  const js = await chunkRes.text();

  const items = [];
  const PATTERNS = [
    { re: /name:"([a-z][^"]+)",displayName:"([^"]+)",description:"([^"]*)",extra:"([^"]+)"/g, hasDesc: true },
    { re: /name:"([a-z][^"]+)",displayName:"([^"]+)",extra:"([^"]+)"/g, hasDesc: false },
    { re: /name:"([^"]+)",displayName:"([^"]+)",description:"([^"]*)",extra:"([^"]+)"/g, hasDesc: true },
    { re: /name:"([^"]+)",displayName:"([^"]+)",extra:"([^"]+)"/g, hasDesc: false },
  ];
  for (const { re, hasDesc } of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(js)) !== null) {
      items.push({
        id: m[1],
        displayName: m[2],
        description: hasDesc ? m[3] : '',
        tickers: (hasDesc ? m[4] : m[3]).split(','),
      });
    }
    if (items.length > 0) break;
  }
  return items;
}

async function fetchPerfData(st, type = 'themes') {
  const res = await fetch(`${FINVIZ_BASE}/api/map_perf.ashx?type=${type}&st=${st}`);
  if (!res.ok) throw new Error(`Performance API returned ${res.status} for st=${st}`);
  const data = await res.json();
  return data.nodes || {};
}

function avgPerf(tickers, perfData) {
  const vals = tickers.map((t) => perfData[t]).filter((v) => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function computeCompositeRS(ticker, perfByKey) {
  const spy1w = perfByKey['w1']?.['SPY'] ?? 0;
  const spy1m = perfByKey['w4']?.['SPY'] ?? 0;
  const spy3m = perfByKey['w13']?.['SPY'] ?? 0;
  const p1w = perfByKey['w1']?.[ticker] ?? 0;
  const p1m = perfByKey['w4']?.[ticker] ?? 0;
  const p3m = perfByKey['w13']?.[ticker] ?? 0;
  return (p1w * 3 + p1m * 2 + p3m * 1) - (spy1w * 3 + spy1m * 2 + spy3m * 1);
}

// ---------------------------------------------------------------------------
// Step 1 — Theme Filter + Momentum Scoring
// ---------------------------------------------------------------------------

function scoreThemes(themes, perfByKey) {
  const weights = AGGRESSIVE_WEIGHTS;
  const weightedTfs = TIMEFRAMES.filter((tf) => weights[tf.key] > 0);
  const weightedTfsLongFirst = [...weightedTfs].reverse();

  // Build rank-by-timeframe
  const rankByTf = {};
  for (const tf of TIMEFRAMES) {
    const withPerf = themes.filter((t) => t.perf[tf.key] != null);
    const sorted = [...withPerf].sort((a, b) => b.perf[tf.key] - a.perf[tf.key]);
    const total = sorted.length;
    rankByTf[tf.key] = Object.fromEntries(sorted.map((t, i) => [t.id, { rank: i + 1, total }]));
  }

  // Compute momentum for each theme
  const scored = themes.map((t) => {
    let rankWSum = 0, rankWDiv = 0;
    for (const tf of weightedTfs) {
      const r = rankByTf[tf.key]?.[t.id];
      if (r) { rankWSum += r.rank * weights[tf.key]; rankWDiv += weights[tf.key]; }
    }
    const mtmRankScore = rankWDiv > 0 ? rankWSum / rankWDiv : null;

    let perfWSum = 0, perfWDiv = 0;
    for (const tf of weightedTfs) {
      const p = t.perf[tf.key];
      if (p != null) { perfWSum += p * weights[tf.key]; perfWDiv += weights[tf.key]; }
    }
    const mtmPerfScore = perfWDiv > 0 ? perfWSum / perfWDiv : null;

    // Acceleration
    let mtmAccel = null;
    const accelRanks = weightedTfsLongFirst
      .map((tf) => rankByTf[tf.key]?.[t.id]?.rank)
      .filter((v) => v != null);
    if (accelRanks.length >= 2) {
      const total = rankByTf[weightedTfs[0].key]?.[t.id]?.total || themes.length;
      const slope = (accelRanks[0] - accelRanks[accelRanks.length - 1]) / (accelRanks.length - 1);
      mtmAccel = Math.round((slope / total) * 100) / 100;
    }

    return { ...t, mtmRankScore, mtmPerfScore, mtmAccel, rankByTf };
  });

  // Sort by momentum rank score (ascending = best first)
  const ranked = scored
    .filter((t) => t.mtmRankScore != null)
    .sort((a, b) => a.mtmRankScore - b.mtmRankScore);

  // Build overextended set (for red-flag exclusion)
  const reversalData = themes
    .map((t) => {
      const r1m = rankByTf['w4']?.[t.id];
      const r1y = rankByTf['w52']?.[t.id];
      if (!r1m || !r1y) return null;
      return { id: t.id, divergence: r1y.rank - r1m.rank };
    })
    .filter(Boolean);
  const overextendedIds = new Set(
    [...reversalData].sort((a, b) => b.divergence - a.divergence).slice(0, 10).map((r) => r.id)
  );

  // Filter: top 10, acceleration > 0.01, 1W > 3%, >= 5 liquid tickers
  const qualifying = [];
  for (let i = 0; i < Math.min(ranked.length, 10); i++) {
    const t = ranked[i];
    const rank = i + 1;

    // Must have positive acceleration
    if ((t.mtmAccel ?? 0) <= 0) continue;

    // 1W perf > 1% (relaxed from 3% to avoid empty list in choppy markets)
    if ((t.perf.w1 ?? 0) <= 1) continue;

    // At least 5 tickers
    if (t.tickers.length < 5) continue;

    // Red-flag: blow-off top
    if ((t.perf.d1 ?? 0) > 15 && (t.perf.w1 ?? 0) < 5) continue;

    // Red-flag: overextended (in reversals list)
    if (overextendedIds.has(t.id)) continue;

    // Assign tier
    let tier;
    if (rank <= 3 && (t.mtmAccel ?? 0) >= 0.02) tier = 'A';
    else if (rank <= 7) tier = 'B';
    else tier = 'C';

    qualifying.push({ ...t, themeRank: rank, themeTier: tier });
  }

  return { qualifying, perfByKey, rankByTf };
}

// ---------------------------------------------------------------------------
// Step 2–4 — Stock Scoring, Disqualification, Ranking
// ---------------------------------------------------------------------------

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function scoreStock(ticker, rsComposite, rvol, themeAccel) {
  // RS composite is typically -30 to +30; normalise to 0-100 (0 at -10, 100 at +20)
  const rsNorm = clamp(((rsComposite + 10) / 30) * 100, 0, 100);
  const rvolNorm = clamp((rvol - 1) * 50, 0, 100);
  const accelNorm = clamp(themeAccel * 1000, 0, 100);
  return 0.55 * rsNorm + 0.30 * rvolNorm + 0.15 * accelNorm;
}

function getStopPct(themeName) {
  const lower = themeName.toLowerCase();
  if (WIDE_STOP_SECTORS.some((s) => lower.includes(s))) return 0.04;
  if (TIGHT_STOP_SECTORS.some((s) => lower.includes(s))) return 0.025;
  return 0.035;
}

function getRiskPct(tier) {
  if (tier === 'A') return 0.015;
  if (tier === 'B') return 0.01;
  return 0.005;
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

/**
 * Runs the full watchlist scoring pipeline.
 * @param {Function} onProgress - called with { phase, loaded, total } during ticker fetch
 * @returns {{ items: Array, loading: boolean }}
 */
export async function runWatchlistPipeline(onProgress) {
  // 1. Fetch theme definitions + performance
  onProgress?.({ phase: 'themes', loaded: 0, total: 0 });

  const defs = await fetchDefinitions();
  const [perfResults, secPerfResults] = await Promise.all([
    Promise.all(TIMEFRAMES.map((tf) => fetchPerfData(tf.st, 'themes'))),
    Promise.all(TIMEFRAMES.map((tf) => fetchPerfData(tf.st, 'sec').catch(() => ({})))),
  ]);

  const perfByKey = Object.fromEntries(
    TIMEFRAMES.map((tf, i) => [tf.key, { ...secPerfResults[i], ...perfResults[i] }])
  );

  const themes = defs
    .map((t) => ({
      ...t,
      perf: Object.fromEntries(
        TIMEFRAMES.map((tf) => [tf.key, avgPerf(t.tickers, perfByKey[tf.key])])
      ),
    }))
    .filter((t) => TIMEFRAMES.some((tf) => t.perf[tf.key] != null));

  // 2. Score and filter themes
  const { qualifying } = scoreThemes(themes, perfByKey);

  console.log(`[watchlist] ${themes.length} themes loaded, ${qualifying.length} qualifying`);
  if (qualifying.length === 0) {
    // Log why themes failed to help debug
    const weights = AGGRESSIVE_WEIGHTS;
    const weightedTfs = TIMEFRAMES.filter((tf) => weights[tf.key] > 0);
    const ranked = themes
      .map((t) => {
        let rankWSum = 0, rankWDiv = 0;
        const withPerf = themes.filter((th) => th.perf.w1 != null);
        const sorted = [...withPerf].sort((a, b) => (b.perf.w1 ?? 0) - (a.perf.w1 ?? 0));
        const rank = sorted.findIndex((s) => s.id === t.id) + 1;
        return { name: t.displayName, w1: t.perf.w1, accel: null, rank, tickers: t.tickers.length };
      })
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 5);
    console.log('[watchlist] Top 5 themes by 1W:', ranked);
    return { items: [], perfByKey };
  }

  // 3. Collect all unique tickers from qualifying themes
  const tickerThemeMap = {}; // ticker → { themeName, themeTier, themeRank, themeAccel, themeAvg1W }
  for (const theme of qualifying) {
    for (const ticker of theme.tickers) {
      if (!tickerThemeMap[ticker]) {
        tickerThemeMap[ticker] = {
          themeName: theme.displayName,
          themeTier: theme.themeTier,
          themeRank: theme.themeRank,
          themeAccel: theme.mtmAccel,
          themeAvg1W: theme.perf.w1,
        };
      }
    }
  }

  const allTickers = Object.keys(tickerThemeMap);
  onProgress?.({ phase: 'stocks', loaded: 0, total: allTickers.length });

  // 4. Fetch per-ticker data (sequential with 150ms delay for rate limiting)
  const stockResults = [];
  for (let i = 0; i < allTickers.length; i++) {
    const ticker = allTickers[i];
    const themeInfo = tickerThemeMap[ticker];

    try {
      const perf = await getStockPerformance(ticker);
      if (!perf || perf.price == null) continue;

      const rsComposite = computeCompositeRS(ticker, {
        w1: { ...perfByKey.w1, [ticker]: perf.w1 ?? perfByKey.w1?.[ticker] ?? 0 },
        w4: { ...perfByKey.w4, [ticker]: perf.w4 ?? perfByKey.w4?.[ticker] ?? 0 },
        w13: { ...perfByKey.w13, [ticker]: perf.w13 ?? perfByKey.w13?.[ticker] ?? 0 },
      });

      const rvol = perf.relVolume ?? 0;
      const perf1W = perf.w1 ?? perfByKey.w1?.[ticker] ?? null;
      const perf1M = perf.w4 ?? perfByKey.w4?.[ticker] ?? null;

      // Step 3 — Disqualification
      // RS composite is a weighted diff (typically -30 to +30), not 0-100; require positive RS
      if (rsComposite < 0) continue;
      if ((perf1M ?? 0) > 30) continue;
      if (rvol < 1.0) continue;
      if (perf1W != null && themeInfo.themeAvg1W != null && perf1W < themeInfo.themeAvg1W) continue;

      const watchlistScore = scoreStock(ticker, rsComposite, rvol, themeInfo.themeAccel ?? 0);

      const stopPct = getStopPct(themeInfo.themeName);
      const stopLoss = perf.price * (1 - stopPct);
      const riskPct = getRiskPct(themeInfo.themeTier);

      stockResults.push({
        ticker,
        themeName: themeInfo.themeName,
        themeTier: themeInfo.themeTier,
        themeRank: themeInfo.themeRank,
        themeAccel: themeInfo.themeAccel,
        rsComposite: Math.round(rsComposite),
        rvol,
        perf1W,
        perfThemeAvg1W: themeInfo.themeAvg1W,
        watchlistScore: Math.round(watchlistScore * 10) / 10,
        price: perf.price,
        entry: Math.round(perf.price * 100) / 100,
        stopLoss: Math.round(stopLoss * 100) / 100,
        target1: Math.round(perf.price * 1.06 * 100) / 100,
        target2: Math.round(perf.price * 1.13 * 100) / 100,
        riskPct,
        stopPct,
      });
    } catch {
      // skip failed tickers
    }

    onProgress?.({ phase: 'stocks', loaded: i + 1, total: allTickers.length });
    if (i < allTickers.length - 1) await new Promise((r) => setTimeout(r, 150));
  }

  // Step 4 — Rank & Cap at 10
  stockResults.sort((a, b) => b.watchlistScore - a.watchlistScore);
  const items = stockResults.slice(0, 10);

  return { items, perfByKey };
}
