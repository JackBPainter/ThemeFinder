// Yahoo Finance unofficial options API — no API key required.
// NOTE: This API is unofficial and unsupported by Yahoo. It may break without notice.
// CORS: query2.finance.yahoo.com works in most browsers, but if you see CORS errors
// in the console you will need a local proxy (e.g. Vite's server.proxy config).
//
// The default call (no date param) returns the nearest expiry — one request per ticker.

// Routed through the Vite dev proxy (/api/yahoo → https://query2.finance.yahoo.com)
// to avoid CORS errors in the browser. See vite.config.js server.proxy.
const BASE_URL = '/api/yahoo';

/**
 * Fetches the nearest-expiry options chain for a ticker from Yahoo Finance.
 * Normalises contracts into the same shape expected by computeTickerSnapshot:
 *   { details: { contract_type }, day: { volume }, open_interest }
 *
 * Returns [] on error, 404, CORS failure, or empty response.
 */
export async function getOptionsChainSnapshot(ticker) {
  try {
    const res = await fetch(
      `${BASE_URL}/v7/finance/options/${encodeURIComponent(ticker)}`,
    );

    if (!res.ok) {
      console.warn(`[yahooApi] ${ticker}: HTTP ${res.status}`);
      return [];
    }

    const data = await res.json();
    const result = data?.optionChain?.result?.[0];

    if (!result?.options?.length) {
      console.warn(`[yahooApi] ${ticker}: no options data returned`);
      return [];
    }

    // options[0] is the nearest expiry (Yahoo returns nearest by default)
    const chain = result.options[0];

    const calls = (chain.calls ?? []).map((c) => ({
      details: { contract_type: 'call' },
      day: { volume: c.volume ?? 0 },
      open_interest: c.openInterest ?? 0,
    }));

    const puts = (chain.puts ?? []).map((c) => ({
      details: { contract_type: 'put' },
      day: { volume: c.volume ?? 0 },
      open_interest: c.openInterest ?? 0,
    }));

    return [...calls, ...puts];
  } catch (err) {
    // TypeError with "Failed to fetch" typically means a CORS block
    const isCors =
      err instanceof TypeError && err.message.toLowerCase().includes('fetch');
    if (isCors) {
      console.warn(
        `[yahooApi] ${ticker}: CORS error — Yahoo Finance blocked the request from the browser. ` +
          'Consider adding a Vite proxy (see vite.config.js server.proxy).',
      );
    } else {
      console.warn(`[yahooApi] getOptionsChainSnapshot error for ${ticker}:`, err.message);
    }
    return [];
  }
}

/**
 * Fetches 1-year daily adjusted-close history for a stock and computes percentage
 * returns for each of the 6 ThemeFinder timeframes. One API call per ticker.
 *
 * Returns { d1, w1, w4, w13, w26, w52 } matching the tickerPerf key schema,
 * or null on error / insufficient data.
 */
export async function getStockPerformance(ticker) {
  try {
    const res = await fetch(
      `${BASE_URL}/v8/finance/chart/${encodeURIComponent(ticker)}?range=1y&interval=1d`,
    );
    if (!res.ok) {
      console.warn(`[yahooApi] ${ticker}: HTTP ${res.status} on chart request`);
      return null;
    }

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    // Prefer adjusted closes (splits/dividends corrected); fall back to raw close
    const rawCloses =
      result.indicators?.adjclose?.[0]?.adjclose ??
      result.indicators?.quote?.[0]?.close;
    if (!rawCloses) return null;

    // Remove nulls introduced by non-trading days
    const closes = rawCloses.filter((v) => v != null);
    if (closes.length < 2) return null;

    const last = closes[closes.length - 1];
    // pct return from N trading days ago to today; clamps to earliest available
    const pct = (n) => {
      const base = closes[Math.max(0, closes.length - 1 - n)];
      return base ? ((last - base) / base) * 100 : null;
    };

    // Volume data: compute today's volume and 3-month average volume for RVOL
    const volumes = result.indicators?.quote?.[0]?.volume;
    let volume = null;
    let avgVolume = null;
    let relVolume = null;

    if (volumes && volumes.length > 0) {
      // Today's volume is the last entry
      volume = volumes[volumes.length - 1];
      // Average volume over the last ~63 trading days (3 months)
      const recentVols = volumes.slice(-63).filter((v) => v != null && v > 0);
      if (recentVols.length > 1) {
        // Exclude today from average to get a fair RVOL comparison
        const avgVols = recentVols.slice(0, -1);
        avgVolume = Math.round(avgVols.reduce((a, b) => a + b, 0) / avgVols.length);
        if (avgVolume > 0 && volume != null) {
          relVolume = Math.round((volume / avgVolume) * 100) / 100;
        }
      }
    }

    return {
      d1:  pct(1),
      w1:  pct(5),
      w4:  pct(21),
      w13: pct(63),
      w26: pct(126),
      // 1Y: use the earliest close available (may be < 252 days for newer listings)
      w52: closes.length > 1 ? ((last - closes[0]) / closes[0]) * 100 : null,
      volume,
      avgVolume,
      relVolume,
    };
  } catch (err) {
    console.warn(`[yahooApi] getStockPerformance error for ${ticker}:`, err.message);
    return null;
  }
}

/**
 * Fetches today's pre-market volume for a ticker using 1-minute intraday data.
 * Uses includePrePost=true to get extended hours bars, then sums volume for
 * bars before 9:30 AM ET (market open).
 *
 * Returns the pre-market volume as a number, or null on error / no data.
 */
export async function getPreMarketVolume(ticker) {
  const pmUrl = `${BASE_URL}/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1m&includePrePost=true`;
  try {
    const res = await fetch(pmUrl);
    if (!res.ok) return null;

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta ?? {};

    // Strategy 1: Use meta.preMarketVolume if available
    if (meta.preMarketVolume != null && meta.preMarketVolume > 0) {
      return meta.preMarketVolume;
    }

    // Strategy 2: Sum volume from pre-market 1-minute bars
    const timestamps = result.timestamp;
    const volumes = result.indicators?.quote?.[0]?.volume;
    if (!timestamps || !volumes) return null;

    const gmtOffset = meta.gmtoffset ?? -14400;
    const marketOpenLocalSecs = 9 * 3600 + 30 * 60; // 9:30 AM ET

    let pmVolume = 0;
    for (let i = 0; i < timestamps.length; i++) {
      const localSecs = ((timestamps[i] + gmtOffset) % 86400 + 86400) % 86400;
      if (localSecs >= 4 * 3600 && localSecs < marketOpenLocalSecs && volumes[i] != null) {
        pmVolume += volumes[i];
      }
    }

    return pmVolume > 0 ? pmVolume : null;
  } catch (err) {
    console.warn(`[pmvol] ${ticker}: error`, err.message);
    return null;
  }
}

/**
 * Pure function — computes per-ticker flow metrics from a normalised contracts array.
 *
 * Field mapping (after normalisation in getOptionsChainSnapshot):
 *   contract type  →  details.contract_type  ("call" | "put")
 *   daily volume   →  day.volume
 *   open interest  →  open_interest
 */
export function computeTickerSnapshot(ticker, contracts) {
  let totalCallVolume = 0;
  let totalPutVolume = 0;
  let unusualCount = 0;
  let denomCount = 0;

  for (const c of contracts) {
    const vol = c?.day?.volume ?? 0;
    const oi = c?.open_interest ?? 0;
    const type = c?.details?.contract_type;

    if (type === 'call') totalCallVolume += vol;
    else if (type === 'put') totalPutVolume += vol;

    // Unusual score: only contracts with non-zero volume AND OI
    if (vol > 0 && oi > 0) {
      denomCount++;
      if (vol / oi >= 0.5) unusualCount++;
    }
  }

  const cpRatio =
    totalPutVolume === 0
      ? null
      : Math.round((totalCallVolume / totalPutVolume) * 100) / 100;

  const unusualScore =
    denomCount === 0 ? 0 : Math.round((unusualCount / denomCount) * 100) / 100;

  return {
    ticker,
    totalCallVolume,
    totalPutVolume,
    cpRatio,
    unusualScore,
    contractCount: contracts.length,
  };
}

/**
 * Pure function — aggregates ticker snapshots into a theme-level flow signal.
 * Identical to the Tradier/Polygon version — flow score formula and thresholds unchanged.
 */
export function computeThemeFlow(themeId, label, tickerSnapshots) {
  const withCpRatio = tickerSnapshots.filter((s) => s !== null && s.cpRatio !== null);
  const allValid = tickerSnapshots.filter((s) => s !== null);

  const avgCpRatio =
    withCpRatio.length === 0
      ? 0
      : Math.round(
          (withCpRatio.reduce((sum, s) => sum + s.cpRatio, 0) / withCpRatio.length) * 100,
        ) / 100;

  const cpRatioLabel =
    avgCpRatio > 1.2 ? 'bullish' : avgCpRatio < 0.8 ? 'bearish' : 'neutral';

  const avgUnusualScore =
    allValid.length === 0
      ? 0
      : Math.round(
          (allValid.reduce((sum, s) => sum + s.unusualScore, 0) / allValid.length) * 100,
        ) / 100;

  const unusualFlag = avgUnusualScore > 0.3;

  const cpScore = Math.min(100, Math.max(0, (avgCpRatio / 2) * 100));
  const unusualBonus = avgUnusualScore * 30;
  const flowScore = Math.round(Math.min(100, cpScore + unusualBonus));

  let flowSignal;
  if (flowScore >= 80) flowSignal = 'strong_bull';
  else if (flowScore >= 60) flowSignal = 'bull';
  else if (flowScore >= 40) flowSignal = 'neutral';
  else if (flowScore >= 20) flowSignal = 'bear';
  else flowSignal = 'strong_bear';

  return {
    themeId,
    label,
    computedAt: new Date().toISOString(),
    fetchedTickers: allValid.map((s) => s.ticker),
    avgCpRatio,
    cpRatioLabel,
    avgUnusualScore,
    unusualFlag,
    flowScore,
    flowSignal,
  };
}
