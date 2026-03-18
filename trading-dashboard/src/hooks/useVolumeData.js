import { useState, useCallback, useMemo, useRef } from 'react';

// ---------------------------------------------------------------------------
// HTML parsing — Finviz screener Overview (v=111, always works without login)
// Returns: { ticker, volume, change } per row
// ---------------------------------------------------------------------------

function parseScreenerHtml(html, pageNum) {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Find data rows by looking for ticker links (quote.ashx?t=...)
  const tickerLinks = doc.querySelectorAll('a[href*="quote.ashx?t="]');

  if (tickerLinks.length === 0) {
    if (html.includes('captcha') || html.includes('Please verify')) {
      throw new Error('Finviz rate limit — try again in 60 seconds');
    }
    throw new Error('No ticker data found on page');
  }

  const firstDataRow = tickerLinks[0].closest('tr');
  const dataTable = firstDataRow?.closest('table');
  if (!dataTable) throw new Error('Could not find data table');

  // Find header row
  let headerRow = null;
  for (const row of dataTable.querySelectorAll('tr')) {
    const cells = row.querySelectorAll('td, th');
    const texts = [...cells].map(c => c.textContent.replace(/\s+/g, ' ').trim());
    if (texts.includes('Ticker') && texts.some(t => t === 'Volume' || t === 'Change')) {
      headerRow = row;
      break;
    }
  }
  if (!headerRow) throw new Error('Could not find header row');

  // Build column map
  const headerCells = headerRow.querySelectorAll('td, th');
  const colMap = {};
  headerCells.forEach((cell, idx) => {
    const norm = cell.textContent.replace(/\s+/g, ' ').trim();
    if (norm) colMap[norm] = idx;
  });

  if (pageNum <= 1) {
    console.log('[volume] Finviz columns:', Object.keys(colMap).join(', '));
  }

  const tickerCol = colMap['Ticker'];
  const volumeCol = colMap['Volume'];
  const changeCol = colMap['Change'];
  const mktCapCol = colMap['Market Cap'];

  if (tickerCol === undefined) throw new Error('Missing Ticker column');

  // Parse data rows
  const allRows = dataTable.querySelectorAll('tr');
  const results = [];
  let pastHeader = false;

  for (const row of allRows) {
    if (row === headerRow) { pastHeader = true; continue; }
    if (!pastHeader) continue;

    const cells = row.querySelectorAll('td');
    if (cells.length <= tickerCol) continue;

    const tickerCell = cells[tickerCol];
    const tickerLink = tickerCell?.querySelector('a');
    const rawTicker = (tickerLink?.textContent || tickerCell?.textContent || '').trim();
    if (!rawTicker || rawTicker === 'Ticker') continue;

    const parseNum = (colIdx) => {
      if (colIdx === undefined || !cells[colIdx]) return null;
      const txt = cells[colIdx].textContent.trim();
      if (!txt || txt === '-') return null;
      return parseFloat(txt.replace(/,/g, '').replace(/%/g, ''));
    };

    const volume = parseNum(volumeCol);
    const change = parseNum(changeCol);
    if (volume == null && change == null) continue;

    // Market Cap: Finviz formats as e.g. "548.23B", "12.34M", "1.23T"
    let marketCap = null;
    if (mktCapCol !== undefined && cells[mktCapCol]) {
      const mcTxt = cells[mktCapCol].textContent.trim();
      const mcMatch = mcTxt.match(/^([\d.]+)([BMTK])?$/i);
      if (mcMatch) {
        const num = parseFloat(mcMatch[1]);
        const suffix = (mcMatch[2] || '').toUpperCase();
        const mult = suffix === 'T' ? 1e12 : suffix === 'B' ? 1e9 : suffix === 'M' ? 1e6 : suffix === 'K' ? 1e3 : 1;
        marketCap = num * mult;
      }
    }

    results.push({
      ticker: rawTicker,
      volume: volume != null ? Math.round(volume) : null,
      change: change != null ? change : null,
      marketCap,
    });
  }

  if (pageNum <= 1 && results.length > 0) {
    console.log('[volume] Sample Finviz row:', JSON.stringify(results[0]));
  }

  return results;
}

// ---------------------------------------------------------------------------
// Yahoo Finance batch quote — fetches averageVolume for multiple tickers
// ---------------------------------------------------------------------------

async function fetchAvgVolumeBatch(tickers) {
  // Yahoo v6/v7 quote endpoint supports comma-separated symbols
  const symbols = tickers.join(',');
  const url = `/api/yahoo/v6/finance/quote?symbols=${encodeURIComponent(symbols)}`;
  const res = await fetch(url);
  if (!res.ok) return {};
  const json = await res.json();
  const quotes = json?.quoteResponse?.result ?? json?.finance?.result?.[0]?.quotes ?? [];
  const map = {};
  for (const q of quotes) {
    if (q.symbol && q.averageDailyVolume3Month != null) {
      map[q.symbol] = q.averageDailyVolume3Month;
    } else if (q.symbol && q.averageDailyVolume10Day != null) {
      map[q.symbol] = q.averageDailyVolume10Day;
    }
  }
  return map;
}

async function fetchAllAvgVolumes(allTickers, signal) {
  const BATCH_SIZE = 100; // Yahoo supports up to ~200 per request
  const result = {};
  const batches = [];
  for (let i = 0; i < allTickers.length; i += BATCH_SIZE) {
    batches.push(allTickers.slice(i, i + BATCH_SIZE));
  }

  for (let i = 0; i < batches.length; i++) {
    if (signal?.aborted) break;
    try {
      const map = await fetchAvgVolumeBatch(batches[i]);
      Object.assign(result, map);
    } catch (err) {
      console.warn(`[volume] Yahoo avg volume batch ${i + 1}/${batches.length} failed:`, err.message);
    }
    // Small delay between batches
    if (i < batches.length - 1) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  if (Object.keys(result).length > 0) {
    console.log(`[volume] Yahoo avg volume: ${Object.keys(result).length}/${allTickers.length} tickers`);
  } else {
    console.warn('[volume] Yahoo avg volume: no data returned (RVOL will be unavailable)');
  }

  return result;
}

// ---------------------------------------------------------------------------
// Fetching — Finviz screener pages
// ---------------------------------------------------------------------------

async function fetchScreenerPage(allTickers, page) {
  const tickerParam = allTickers.join(',');
  const r = (page - 1) * 20 + 1;
  const url = `/api/finviz/screener.ashx?v=111&t=${tickerParam}&r=${r}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Screener returned ${res.status} for page ${page}`);
  const html = await res.text();
  return parseScreenerHtml(html, page);
}

async function fetchAllVolumeData(allTickers, signal) {
  const pages = Math.ceil(allTickers.length / 20);
  const merged = {};
  let loadedCount = 0;

  // Fetch Finviz screener pages for today's volume + change
  for (let page = 1; page <= pages; page++) {
    if (signal?.aborted) break;
    try {
      const rows = await fetchScreenerPage(allTickers, page);
      for (const row of rows) {
        merged[row.ticker] = row;
        loadedCount++;
      }
    } catch (err) {
      console.warn(`[volume] Finviz page ${page}/${pages} failed:`, err.message);
    }
    if (page < pages) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  console.log(`[volume] Finviz done: ${loadedCount}/${allTickers.length} tickers`);

  // Fetch average volume from Yahoo Finance to compute RVOL
  if (!signal?.aborted && loadedCount > 0) {
    const avgVolumes = await fetchAllAvgVolumes(allTickers, signal);
    for (const [ticker, avgVol] of Object.entries(avgVolumes)) {
      if (merged[ticker] && avgVol > 0) {
        merged[ticker].avgVolume = Math.round(avgVol);
        merged[ticker].relVolume = Math.round((merged[ticker].volume / avgVol) * 100) / 100;
      }
    }
    const rvolCount = Object.values(merged).filter(v => v.relVolume != null).length;
    console.log(`[volume] RVOL computed for ${rvolCount}/${loadedCount} tickers`);
  }

  return { data: merged, loadedCount, totalTickers: allTickers.length };
}

// ---------------------------------------------------------------------------
// Volume metrics computation (pure)
// ---------------------------------------------------------------------------

function computeVolumeMetrics(themes, volumeData, tickerPerf, rvolThreshold) {
  if (!volumeData) return {};

  const metrics = {};
  for (const theme of themes) {
    const tickers = theme.tickers;
    let rvolTickers = 0;
    let totalWithData = 0;
    let rvolSum = 0;
    let maxRelVolume = 0;
    let maxRvolTicker = null;
    let bullishVolCount = 0;
    let bearishVolCount = 0;

    for (const ticker of tickers) {
      const vd = volumeData[ticker];
      if (!vd || vd.relVolume == null) continue;
      totalWithData++;
      rvolSum += vd.relVolume;

      if (vd.relVolume > maxRelVolume) {
        maxRelVolume = vd.relVolume;
        maxRvolTicker = ticker;
      }

      if (vd.relVolume >= rvolThreshold) {
        rvolTickers++;
        const dayPerf = tickerPerf?.['d1']?.[ticker] ?? vd.change ?? 0;
        if (dayPerf > 0) bullishVolCount++;
        else if (dayPerf < 0) bearishVolCount++;
      }
    }

    if (totalWithData === 0) {
      metrics[theme.id] = null;
      continue;
    }

    const rvolRatio = rvolTickers / totalWithData;
    const avgRelVolume = rvolSum / totalWithData;
    const volumeDirectionScore = rvolTickers > 0
      ? (bullishVolCount - bearishVolCount) / rvolTickers
      : 0;

    const volumeScore =
      (rvolRatio * 40) +
      (Math.min(avgRelVolume, 5) * 10) +
      (volumeDirectionScore * 10);

    metrics[theme.id] = {
      rvolTickers,
      totalWithData,
      rvolRatio,
      avgRelVolume: Math.round(avgRelVolume * 100) / 100,
      maxRelVolume: Math.round(maxRelVolume * 100) / 100,
      maxRvolTicker,
      bullishVolCount,
      bearishVolCount,
      volumeDirectionScore: Math.round(volumeDirectionScore * 100) / 100,
      volumeScore: Math.round(volumeScore * 10) / 10,
    };
  }

  return metrics;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function useVolumeData(themes, tickerPerf, rvolThreshold) {
  const [volumeData, setVolumeData] = useState(null);
  const [volumeLoading, setVolumeLoading] = useState(false);
  const [volumeError, setVolumeError] = useState(null);
  const [loadStats, setLoadStats] = useState(null);
  const abortRef = useRef(null);
  const cacheRef = useRef({ data: null, timestamp: null });

  const fetchVolume = useCallback(async (bustCache = false) => {
    if (themes.length === 0) return;

    const cache = cacheRef.current;
    if (!bustCache && cache.data && cache.timestamp && (Date.now() - cache.timestamp < CACHE_TTL)) {
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const allTickers = [...new Set(themes.flatMap((t) => t.tickers))];

    setVolumeLoading(true);
    setVolumeError(null);

    try {
      const result = await fetchAllVolumeData(allTickers, controller.signal);
      if (controller.signal.aborted) return;

      cacheRef.current = { data: result.data, timestamp: Date.now() };
      setVolumeData(result.data);
      setLoadStats({ loadedCount: result.loadedCount, totalTickers: result.totalTickers });

      if (result.loadedCount === 0) {
        setVolumeError('No volume data could be loaded');
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setVolumeError(err.message);
    } finally {
      if (!controller.signal.aborted) setVolumeLoading(false);
    }
  }, [themes]);

  const volumeMetrics = useMemo(
    () => computeVolumeMetrics(themes, volumeData, tickerPerf, rvolThreshold),
    [themes, volumeData, tickerPerf, rvolThreshold],
  );

  const clearVolume = useCallback(() => {
    cacheRef.current = { data: null, timestamp: null };
    setVolumeData(null);
    setVolumeError(null);
    setLoadStats(null);
    if (abortRef.current) abortRef.current.abort();
  }, []);

  return {
    volumeData,
    volumeMetrics,
    volumeLoading,
    volumeError,
    loadStats,
    fetchVolume,
    clearVolume,
  };
}
