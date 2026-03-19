import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Home as HomeIcon, RefreshCw } from 'lucide-react';
import { getStockPerformance } from '../services/yahooFinanceApi';
import { fetchFinvizSnapshot } from '../services/earningsService';

const TIMEFRAMES = [
  { key: 'd1',  st: '',    short: '1D' },
  { key: 'w1',  st: 'w1',  short: '1W' },
  { key: 'w4',  st: 'w4',  short: '1M' },
  { key: 'w13', st: 'w13', short: '3M' },
  { key: 'w26', st: 'w26', short: '6M' },
  { key: 'w52', st: 'w52', short: '1Y' },
];

const PRESETS = [
  { key: 'aggressive', label: 'Aggressive', weights: { d1: 4, w1: 3, w4: 1, w13: 0, w26: 0, w52: 0 } },
  { key: 'balanced',   label: 'Balanced',   weights: { d1: 1, w1: 3, w4: 2, w13: 1, w26: 0, w52: 0 } },
  { key: 'swing',      label: 'Swing',      weights: { d1: 0, w1: 3, w4: 2, w13: 1, w26: 0, w52: 0 } },
  { key: 'meanReversion', label: 'Mean Reversion', weights: { d1: 0, w1: 0, w4: 1, w13: 2, w26: 3, w52: 4 } },
];

async function fetchDefinitions(mapType) {
  const t = mapType === 'sectors' ? 'sec' : 'themes';
  const mapRes = await fetch(`/api/finviz/map.ashx?t=${t}`);
  if (!mapRes.ok) throw new Error(`Finviz map page returned ${mapRes.status}`);
  const mapHtml = await mapRes.text();

  const chunkPattern = mapType === 'sectors'
    ? /href="(\/assets\/dist\/map_base_sec[^"]+\.js)"/
    : /href="(\/assets\/dist\/map_base_themes[^"]+\.js)"/;
  const chunkMatch = mapHtml.match(chunkPattern);
  if (!chunkMatch) throw new Error(`Could not locate ${mapType} data chunk`);

  const chunkRes = await fetch(`/api/finviz${chunkMatch[1]}`);
  if (!chunkRes.ok) throw new Error(`Could not load ${mapType} definitions chunk`);
  const js = await chunkRes.text();

  const items = [];

  if (mapType === 'sectors') {
    const nodeRe = /\{name:"([^"]+)",children:\[/g;
    let nm;
    while ((nm = nodeRe.exec(js)) !== null) {
      const name = nm[1];
      const nodeStart = nm.index;
      let depth = 0, end = nodeStart;
      for (let i = nodeStart; i < Math.min(js.length, nodeStart + 400000); i++) {
        if (js[i] === '{') depth++;
        else if (js[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
      }
      const block = js.slice(nodeStart, end + 1);
      if ((block.match(/children:\[/g) || []).length !== 1) continue;
      const tickerRe = /name:"([A-Z][A-Z0-9.]{0,4})",description:/g;
      const tickers = [];
      let tm;
      while ((tm = tickerRe.exec(block)) !== null) tickers.push(tm[1]);
      if (tickers.length > 0) {
        items.push({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, '_'), displayName: name, tickers });
      }
    }
  } else {
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
          tickers: (hasDesc ? m[4] : m[3]).split(','),
        });
      }
      if (items.length > 0) break;
    }
  }
  return items;
}

async function fetchPerfData(st, mapType) {
  const type = mapType === 'sectors' ? 'sec' : 'themes';
  const res = await fetch(`/api/finviz/api/map_perf.ashx?type=${type}&st=${st}`);
  if (!res.ok) throw new Error(`Perf API returned ${res.status}`);
  const data = await res.json();
  return data.nodes || {};
}

function avgPerf(tickers, perfData) {
  const vals = tickers.map((t) => perfData[t]).filter((v) => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function fmt(v) {
  if (v == null) return '-';
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

function perfCls(v) {
  if (v == null) return 'text-gray-500';
  if (v > 3) return 'text-green-400 font-semibold';
  if (v > 0) return 'text-green-500';
  if (v < -3) return 'text-red-400 font-semibold';
  return 'text-red-500';
}

function computeCompositeRS(ticker, tickerPerf) {
  const spy1w = tickerPerf['w1']?.['SPY'] ?? 0;
  const spy1m = tickerPerf['w4']?.['SPY'] ?? 0;
  const spy3m = tickerPerf['w13']?.['SPY'] ?? 0;
  const p1w = tickerPerf['w1']?.[ticker] ?? 0;
  const p1m = tickerPerf['w4']?.[ticker] ?? 0;
  const p3m = tickerPerf['w13']?.[ticker] ?? 0;
  return (p1w * 3 + p1m * 2 + p3m * 1) - (spy1w * 3 + spy1m * 2 + spy3m * 1);
}

function getUSMarketPhase() {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric', minute: 'numeric', weekday: 'short',
    hour12: false,
  });
  const parts = Object.fromEntries(
    f.formatToParts(new Date()).map((p) => [p.type, p.value])
  );
  const day = parts.weekday;
  const mins = parseInt(parts.hour, 10) * 60 + parseInt(parts.minute, 10);
  if (day === 'Sat' || day === 'Sun') return 'closed';
  if (mins >= 240 && mins < 570) return 'premarket';
  if (mins >= 570 && mins < 960) return 'open';
  return 'closed';
}

/** Map acceleration value to an rgba color string */
function accelColor(value) {
  if (value == null) return 'rgba(100,100,100,0.3)';
  const clamped = Math.max(-0.3, Math.min(0.3, value));
  const t = clamped / 0.3;
  if (t >= 0) {
    const intensity = Math.round(40 + t * 160);
    return `rgba(0, ${intensity}, 50, ${0.3 + t * 0.5})`;
  } else {
    const intensity = Math.round(40 + Math.abs(t) * 180);
    return `rgba(${intensity}, 20, 20, ${0.3 + Math.abs(t) * 0.5})`;
  }
}

function accelBorder(value) {
  if (value == null) return 'rgba(100,100,100,0.2)';
  const clamped = Math.max(-0.3, Math.min(0.3, value));
  const t = clamped / 0.3;
  if (t >= 0) return `rgba(34, 197, 94, ${0.2 + t * 0.5})`;
  return `rgba(239, 68, 68, ${0.2 + Math.abs(t) * 0.5})`;
}

/* ── Stock Drill-Down (same table as ThemeFinder) ── */
function HeatmapDrillDown({ theme, tickerPerf, sortBy = 'w1' }) {
  const [extraPerf, setExtraPerf] = useState({});
  const [volData, setVolData] = useState({});
  const [localEarnings, setLocalEarnings] = useState({});
  const [fetchingTickers, setFetchingTickers] = useState(new Set());
  const [hoveredTicker, setHoveredTicker] = useState(null);
  const marketPhase = getUSMarketPhase();

  useEffect(() => {
    let cancelled = false;
    setExtraPerf({});
    setVolData({});

    const missing = theme.tickers.filter(
      (ticker) => !TIMEFRAMES.some((tf) => tickerPerf[tf.key]?.[ticker] != null),
    );
    const allTickers = theme.tickers;
    setFetchingTickers(new Set(allTickers));

    (async () => {
      for (const ticker of allTickers) {
        if (cancelled) break;
        const needsSnapshot = !localEarnings[ticker];
        const [perf, snapshot] = await Promise.all([
          getStockPerformance(ticker),
          needsSnapshot ? fetchFinvizSnapshot(ticker) : Promise.resolve(null),
        ]);
        if (cancelled) break;

        if (perf) {
          setVolData((prev) => ({
            ...prev,
            [ticker]: {
              volume: perf.volume,
              avgVolume: perf.avgVolume,
              relVolume: perf.relVolume,
              price: perf.price,
              marketCap: snapshot?.marketCap ?? prev[ticker]?.marketCap ?? null,
            },
          }));
        } else if (snapshot?.marketCap) {
          setVolData((prev) => ({
            ...prev,
            [ticker]: { ...prev[ticker], marketCap: snapshot.marketCap },
          }));
        }

        if (snapshot?.earnings) {
          setLocalEarnings((prev) => ({ ...prev, [ticker]: snapshot.earnings }));
        }

        if (missing.includes(ticker)) {
          setExtraPerf((prev) => ({ ...prev, [ticker]: perf ?? {} }));
        }

        setFetchingTickers((prev) => { const s = new Set(prev); s.delete(ticker); return s; });
        await new Promise((r) => setTimeout(r, 200));
      }
    })();

    return () => { cancelled = true; };
  }, [theme.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const getPerfForTicker = (ticker) =>
    Object.fromEntries(
      TIMEFRAMES.map((tf) => [
        tf.key,
        tickerPerf[tf.key]?.[ticker] ?? extraPerf[ticker]?.[tf.key] ?? null,
      ]),
    );

  const mergedForRS = {
    ...tickerPerf,
    w1:  { ...(tickerPerf.w1  ?? {}), ...Object.fromEntries(Object.entries(extraPerf).map(([t, p]) => [t, tickerPerf.w1?.[t]  ?? p?.w1  ?? 0])) },
    w4:  { ...(tickerPerf.w4  ?? {}), ...Object.fromEntries(Object.entries(extraPerf).map(([t, p]) => [t, tickerPerf.w4?.[t]  ?? p?.w4  ?? 0])) },
    w13: { ...(tickerPerf.w13 ?? {}), ...Object.fromEntries(Object.entries(extraPerf).map(([t, p]) => [t, tickerPerf.w13?.[t] ?? p?.w13 ?? 0])) },
  };

  const tickerData = theme.tickers
    .map((ticker) => {
      const perfs = getPerfForTicker(ticker);
      const spyPerf = tickerPerf[sortBy]?.['SPY'] ?? 0;
      const rsVsSpy = perfs[sortBy] != null ? perfs[sortBy] - spyPerf : null;
      const compositeRS = computeCompositeRS(ticker, mergedForRS);
      return { ticker, perfs, rsVsSpy, compositeRS };
    })
    .sort((a, b) => b.compositeRS - a.compositeRS);

  const themeAvg = Object.fromEntries(TIMEFRAMES.map((tf) => [tf.key, theme.perf[tf.key]]));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500 border-b border-accent/30">
            <th className="text-left py-1.5 px-2 w-5">#</th>
            <th className="text-left py-1.5 px-2">Ticker</th>
            <th className="text-right py-1.5 px-2">Price</th>
            <th className="text-right py-1.5 px-2">Mkt Cap</th>
            {TIMEFRAMES.map((tf) => (
              <th key={tf.key} className={`text-right py-1.5 px-2 ${sortBy === tf.key ? 'text-gray-200' : ''}`}>
                {tf.short}
              </th>
            ))}
            <th
              className="text-right py-1.5 px-2 whitespace-nowrap cursor-help"
              title={marketPhase === 'open'
                ? 'Regular session volume so far today (9:30 AM – now ET). Excludes pre/after hours.'
                : "Previous session's regular hours volume (9:30 AM – 4:00 PM ET). Excludes pre/after hours."}
            >Vol</th>
            <th
              className="text-right py-1.5 px-2 whitespace-nowrap cursor-help"
              title="Relative Volume — today's volume vs 3-month average daily volume (regular hours only)"
            >RVOL</th>
            <th
              className="text-right py-1.5 px-2 text-blue-400 whitespace-nowrap cursor-help"
              title="Relative Strength vs SPY — stock's performance minus SPY's performance for the selected timeframe"
            >RS/SPY</th>
            <th
              className="text-right py-1.5 px-2 text-purple-400 whitespace-nowrap cursor-help"
              title="Composite Relative Strength — weighted score: (1W × 3 + 1M × 2 + 3M × 1) minus the same for SPY. Higher = stronger momentum vs market."
            >Comp RS</th>
          </tr>
        </thead>
        <tbody>
          {tickerData.map((d, i) => {
            const isLoading = fetchingTickers.has(d.ticker);
            const earn = localEarnings[d.ticker] ?? null;
            return (
              <tr key={d.ticker} className="border-b border-accent/10 hover:bg-accent/10 transition-colors">
                <td className="py-1.5 px-2 text-gray-600 font-mono">{i + 1}</td>
                <td className="py-1.5 px-2">
                  <div className="flex items-center gap-1">
                    <a
                      href={`?stock=${d.ticker}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onMouseEnter={() => setHoveredTicker(d.ticker)}
                      onMouseLeave={() => setHoveredTicker(null)}
                      className={`font-mono font-medium px-1 py-0.5 rounded transition-colors ${
                        hoveredTicker === d.ticker
                          ? 'bg-accent text-white ring-1 ring-accent'
                          : 'text-gray-300 hover:bg-accent/30'
                      }`}
                    >
                      {d.ticker}
                    </a>
                    {earn && (
                      <span
                        className={`text-[10px] font-mono px-1 py-0.5 rounded cursor-help whitespace-nowrap ${
                          earn.daysUntil <= 0
                            ? 'bg-red-900/40 text-red-300 font-semibold'
                            : earn.daysUntil <= 7
                            ? 'bg-red-900/30 text-red-400'
                            : earn.daysUntil <= 14
                            ? 'bg-amber-900/30 text-amber-400'
                            : earn.daysUntil <= 28
                            ? 'bg-yellow-900/30 text-yellow-400'
                            : 'bg-gray-800/40 text-gray-400'
                        }`}
                        title={`Earnings ${earn.daysUntil <= 0 ? 'today/just reported' : `in ${earn.daysUntil} day${earn.daysUntil !== 1 ? 's' : ''}`} (${new Date(earn.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${earn.timing ? ' ' + earn.timing : ''})\nConsider position sizing and stop-loss placement`}
                      >
                        {earn.daysUntil <= 0 ? 'ER today' : `ER ${earn.daysUntil}D`}
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-1.5 px-2 text-right font-mono text-gray-300">
                  {(() => {
                    const p = volData[d.ticker]?.price;
                    if (p == null) return fetchingTickers.has(d.ticker) ? '…' : '-';
                    return `$${p.toFixed(2)}`;
                  })()}
                </td>
                <td className="py-1.5 px-2 text-right font-mono text-gray-400">
                  {(() => {
                    const mc = volData[d.ticker]?.marketCap;
                    if (mc == null) return fetchingTickers.has(d.ticker) ? '…' : '-';
                    if (mc >= 1e12) return `$${(mc / 1e12).toFixed(2)}T`;
                    if (mc >= 1e9) return `$${(mc / 1e9).toFixed(1)}B`;
                    if (mc >= 1e6) return `$${(mc / 1e6).toFixed(0)}M`;
                    return `$${(mc / 1e3).toFixed(0)}K`;
                  })()}
                </td>
                {TIMEFRAMES.map((tf) => (
                  <td key={tf.key} className={`py-1.5 px-2 text-right font-mono ${isLoading && d.perfs[tf.key] == null ? 'text-gray-600' : perfCls(d.perfs[tf.key])}`}>
                    {isLoading && d.perfs[tf.key] == null ? '…' : fmt(d.perfs[tf.key])}
                  </td>
                ))}
                <td className="py-1.5 px-2 text-right font-mono text-gray-400">
                  {(() => {
                    const vd = volData[d.ticker];
                    if (!vd?.volume) return fetchingTickers.has(d.ticker) ? '…' : '-';
                    if (vd.volume >= 1e6) return `${(vd.volume / 1e6).toFixed(1)}M`;
                    if (vd.volume >= 1e3) return `${(vd.volume / 1e3).toFixed(0)}K`;
                    return vd.volume.toLocaleString();
                  })()}
                </td>
                <td className={`py-1.5 px-2 text-right font-mono ${
                  (() => {
                    const rv = volData[d.ticker]?.relVolume;
                    if (rv == null) return 'text-gray-500';
                    if (rv >= 3) return 'text-yellow-400 font-semibold';
                    if (rv >= 2) return 'text-green-400';
                    if (rv >= 1.5) return 'text-green-500';
                    return 'text-gray-500';
                  })()
                }`}>
                  {volData[d.ticker]?.relVolume != null
                    ? `${volData[d.ticker].relVolume.toFixed(1)}x`
                    : fetchingTickers.has(d.ticker) ? '…' : '-'}
                </td>
                <td className={`py-1.5 px-2 text-right font-mono ${
                  isLoading && d.rsVsSpy == null ? 'text-gray-600' :
                  d.rsVsSpy == null ? 'text-gray-500' : d.rsVsSpy >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {isLoading && d.rsVsSpy == null ? '…' : d.rsVsSpy != null ? fmt(d.rsVsSpy) : '-'}
                </td>
                <td className={`py-1.5 px-2 text-right font-mono font-semibold ${perfCls(d.compositeRS)}`}>
                  {d.compositeRS >= 0 ? '+' : ''}{d.compositeRS.toFixed(2)}
                </td>
              </tr>
            );
          })}
          <tr className="border-t border-accent/30 bg-accent/5">
            <td className="py-1.5 px-2 text-gray-600 font-mono">—</td>
            <td className="py-1.5 px-2 text-gray-500 italic">avg</td>
            <td></td>
            <td></td>
            {TIMEFRAMES.map((tf) => (
              <td key={tf.key} className="py-1.5 px-2 text-right font-mono text-gray-500 italic">
                {fmt(themeAvg[tf.key])}
              </td>
            ))}
            <td colSpan={4} className="py-1.5 px-2 text-right text-gray-600 italic">theme avg</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ── Main Heatmap Component ── */
function AccelerationHeatmap({ mapType = 'themes', onBack }) {
  const [themes, setThemes] = useState([]);
  const [tickerPerf, setTickerPerf] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [preset, setPreset] = useState('swing');
  const [expandedId, setExpandedId] = useState(null);
  const drillDownRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setExpandedId(null);
    try {
      const otherMode = mapType === 'themes' ? 'sectors' : 'themes';
      const [defs, ...allPerf] = await Promise.all([
        fetchDefinitions(mapType),
        ...TIMEFRAMES.map((tf) => fetchPerfData(tf.st, mapType)),
        ...TIMEFRAMES.map((tf) => fetchPerfData(tf.st, otherMode)),
      ]);

      const primaryPerf = allPerf.slice(0, TIMEFRAMES.length);
      const secondaryPerf = allPerf.slice(TIMEFRAMES.length);
      const perfByKey = Object.fromEntries(
        TIMEFRAMES.map((tf, i) => [tf.key, { ...secondaryPerf[i], ...primaryPerf[i] }])
      );

      const scored = defs
        .map((t) => ({
          ...t,
          perf: Object.fromEntries(
            TIMEFRAMES.map((tf) => [tf.key, avgPerf(t.tickers, perfByKey[tf.key])])
          ),
        }))
        .filter((t) => TIMEFRAMES.some((tf) => t.perf[tf.key] != null));

      setTickerPerf(perfByKey);
      setThemes(scored);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [mapType]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const activePreset = PRESETS.find((p) => p.key === preset) || PRESETS[2];

  const heatmapData = useMemo(() => {
    if (!themes.length) return [];

    const weights = activePreset.weights;
    const weightedTfs = TIMEFRAMES.filter((tf) => weights[tf.key] > 0);
    const weightedTfsLongFirst = [...weightedTfs].reverse();

    const rankByTf = Object.fromEntries(
      TIMEFRAMES.map((tf) => {
        const withPerf = themes.filter((t) => t.perf[tf.key] != null);
        const sorted = [...withPerf].sort((a, b) => b.perf[tf.key] - a.perf[tf.key]);
        const map = {};
        sorted.forEach((t, i) => { map[t.id] = { rank: i + 1, total: sorted.length }; });
        return [tf.key, map];
      })
    );

    const results = themes.map((t) => {
      let rankWSum = 0, rankWDiv = 0;
      for (const tf of weightedTfs) {
        const r = rankByTf[tf.key][t.id];
        if (r) { rankWSum += r.rank * weights[tf.key]; rankWDiv += weights[tf.key]; }
      }
      const mtmRankScore = rankWDiv > 0 ? rankWSum / rankWDiv : null;

      let mtmAccel = null;
      const accelRanks = weightedTfsLongFirst
        .map((tf) => rankByTf[tf.key][t.id]?.rank)
        .filter((v) => v != null);
      if (accelRanks.length >= 2) {
        const total = rankByTf[weightedTfs[0].key][t.id]?.total || themes.length;
        const slope = (accelRanks[0] - accelRanks[accelRanks.length - 1]) / (accelRanks.length - 1);
        mtmAccel = Math.round((slope / total) * 100) / 100;
      }

      return { ...t, mtmRankScore, mtmAccel };
    });

    return results
      .filter((t) => t.mtmRankScore != null)
      .sort((a, b) => a.mtmRankScore - b.mtmRankScore)
      .map((t, i) => ({ ...t, rank: i + 1 }));
  }, [themes, activePreset]);

  // Scroll drill-down into view when expanded
  useEffect(() => {
    if (expandedId && drillDownRef.current) {
      drillDownRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [expandedId]);

  const handleTileClick = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  // Find the expanded theme object (from themes, which has perf + tickers)
  const expandedTheme = expandedId ? themes.find((t) => t.id === expandedId) : null;

  const noun = mapType === 'sectors' ? 'Sector' : 'Theme';

  // Build rows of tiles using a ref-based approach to detect row breaks
  // We render tiles in a CSS grid and inject the drill-down after the correct row
  // by computing which "row" the expanded tile is in based on grid layout.
  const gridRef = useRef(null);
  const [expandAfterIndex, setExpandAfterIndex] = useState(null);

  useEffect(() => {
    if (!expandedId || !gridRef.current) {
      setExpandAfterIndex(null);
      return;
    }
    // Find all tile elements, determine which row the expanded one is in,
    // and find the last tile in that row
    const tiles = Array.from(gridRef.current.querySelectorAll('[data-tile-id]'));
    const expandedTile = tiles.find((el) => el.dataset.tileId === expandedId);
    if (!expandedTile) { setExpandAfterIndex(null); return; }

    const expandedTop = expandedTile.offsetTop;
    // Find the last tile in the same row (same offsetTop)
    let lastInRow = -1;
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i].offsetTop === expandedTop) lastInRow = i;
    }
    setExpandAfterIndex(lastInRow);
  }, [expandedId, heatmapData]);

  // Listen for resize to recalculate row position
  useEffect(() => {
    if (!expandedId) return;
    const recalc = () => {
      if (!gridRef.current) return;
      const tiles = Array.from(gridRef.current.querySelectorAll('[data-tile-id]'));
      const expandedTile = tiles.find((el) => el.dataset.tileId === expandedId);
      if (!expandedTile) return;
      const expandedTop = expandedTile.offsetTop;
      let lastInRow = -1;
      for (let i = 0; i < tiles.length; i++) {
        if (tiles[i].offsetTop === expandedTop) lastInRow = i;
      }
      setExpandAfterIndex(lastInRow);
    };
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [expandedId]);

  // Build the render list: tiles interleaved with drill-down panel
  const renderItems = useMemo(() => {
    const items = [];
    for (let i = 0; i < heatmapData.length; i++) {
      items.push({ type: 'tile', data: heatmapData[i], index: i });
      if (expandAfterIndex === i && expandedTheme) {
        items.push({ type: 'drilldown', data: expandedTheme });
      }
    }
    return items;
  }, [heatmapData, expandAfterIndex, expandedTheme]);

  return (
    <div className="min-h-screen bg-[#0a0e27] text-white">
      <header className="bg-primary border-b border-accent p-4 flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors"
          title="Back to Home"
        >
          <HomeIcon size={18} />
        </button>
        <h1 className="text-2xl font-bold">{noun} Acceleration Heatmap</h1>
        <button
          onClick={fetchData}
          disabled={loading}
          className="ml-auto flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors disabled:opacity-40"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </header>

      <main className="p-4 max-w-7xl mx-auto">
        {/* Controls */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <span className="text-xs text-gray-500 font-medium">Preset:</span>
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                preset === p.key
                  ? 'bg-accent text-white'
                  : 'bg-secondary/50 text-gray-400 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}

          <div className="ml-auto flex items-center gap-2 text-[10px] text-gray-500">
            <span>Decelerating</span>
            <div className="flex gap-px">
              {[-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3].map((v) => (
                <div
                  key={v}
                  className="w-4 h-3 rounded-sm"
                  style={{ background: accelColor(v) }}
                />
              ))}
            </div>
            <span>Accelerating</span>
          </div>
        </div>

        {error && (
          <div className="text-center text-red-400 text-sm py-8">{error}</div>
        )}
        {loading && !heatmapData.length && (
          <div className="text-center text-gray-500 text-sm py-8">Loading {noun.toLowerCase()} data...</div>
        )}

        {/* Heatmap grid with inline drill-down */}
        {heatmapData.length > 0 && (
          <div
            ref={gridRef}
            className="grid gap-2"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}
          >
            {renderItems.map((item) => {
              if (item.type === 'drilldown') {
                return (
                  <div
                    key="drilldown"
                    ref={drillDownRef}
                    className="rounded-xl border border-accent/40 bg-secondary/60 p-4"
                    style={{ gridColumn: '1 / -1' }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-white">
                        {item.data.displayName}
                        <span className="text-gray-500 font-normal ml-2">
                          {item.data.tickers.length} stock{item.data.tickers.length !== 1 ? 's' : ''}
                        </span>
                      </h3>
                      <button
                        onClick={() => setExpandedId(null)}
                        className="text-gray-500 hover:text-white text-xs transition-colors"
                      >
                        Close
                      </button>
                    </div>
                    <HeatmapDrillDown
                      theme={item.data}
                      tickerPerf={tickerPerf}
                    />
                  </div>
                );
              }

              const t = item.data;
              const isExpanded = expandedId === t.id;
              return (
                <div
                  key={t.id}
                  data-tile-id={t.id}
                  onClick={() => handleTileClick(t.id)}
                  className={`relative rounded-lg p-3 transition-all cursor-pointer hover:scale-[1.03] ${
                    isExpanded ? 'ring-2 ring-white/40' : ''
                  }`}
                  style={{
                    background: accelColor(t.mtmAccel),
                    border: `1px solid ${isExpanded ? 'rgba(255,255,255,0.5)' : accelBorder(t.mtmAccel)}`,
                  }}
                  title={`${t.displayName}\nMomentum Rank: #${t.rank}\nAcceleration: ${t.mtmAccel != null ? (t.mtmAccel >= 0 ? '+' : '') + t.mtmAccel.toFixed(2) : 'N/A'}\nClick to expand`}
                >
                  <div className="absolute top-1.5 right-1.5 bg-black/50 rounded-full w-6 h-6 flex items-center justify-center text-[10px] font-bold text-white/90">
                    {t.rank}
                  </div>

                  <div className="text-xs font-semibold text-white/90 leading-tight pr-6 mb-2" style={{ minHeight: '2rem' }}>
                    {t.displayName}
                  </div>

                  <div className={`text-lg font-bold font-mono ${
                    t.mtmAccel > 0.01 ? 'text-green-300' :
                    t.mtmAccel < -0.01 ? 'text-red-300' :
                    'text-gray-400'
                  }`}>
                    {t.mtmAccel != null
                      ? `${t.mtmAccel >= 0 ? '+' : ''}${t.mtmAccel.toFixed(2)}`
                      : '—'}
                  </div>

                  <div className="text-[9px] text-white/40 mt-1">
                    {t.tickers.length} ticker{t.tickers.length !== 1 ? 's' : ''}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

export default AccelerationHeatmap;
