import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { getStockPerformance } from '../services/yahooFinanceApi';
import { fetchFinvizSnapshot } from '../services/earningsService';

let tvInstanceCount = 0;

const TIMEFRAMES = [
  { key: 'd1', label: '1 Day' },
  { key: 'w1', label: '1 Week' },
  { key: 'w4', label: '1 Month' },
  { key: 'w13', label: '3 Months' },
  { key: 'w26', label: '6 Months' },
  { key: 'w52', label: '1 Year' },
];

const fmt = (v) => (v == null ? '-' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`);
const perfCls = (v) => (v == null ? 'text-gray-500' : v > 0 ? 'text-success' : v < 0 ? 'text-danger' : 'text-gray-400');

const fmtVol = (v) => {
  if (v == null) return '-';
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toLocaleString();
};

function StockDetail({ ticker, onBack }) {
  const [perf, setPerf] = useState(null);
  const [earnings, setEarnings] = useState(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef(null);
  const containerId = useRef(`tv_stock_${++tvInstanceCount}`);
  const tvInit = useRef(false);

  // Fetch performance + earnings
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPerf(null);
    setEarnings(null);
    tvInit.current = false;

    Promise.all([
      getStockPerformance(ticker),
      getStockPerformance('SPY'),
      fetchFinvizSnapshot(ticker),
    ]).then(([p, spy, snap]) => {
      if (cancelled) return;
      if (p && spy) p.spyPerf = spy;
      if (p && snap?.marketCap) p.marketCap = snap.marketCap;
      setPerf(p);
      setEarnings(snap?.earnings ?? null);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [ticker]);

  // Init TradingView chart
  useEffect(() => {
    if (tvInit.current || !containerRef.current || !window.TradingView) return;
    if (!document.getElementById(containerId.current)) return;
    tvInit.current = true;

    new window.TradingView.widget({
      autosize: true,
      symbol: ticker,
      interval: 'D',
      timezone: 'Etc/UTC',
      theme: 'dark',
      style: '1',
      locale: 'en',
      toolbar_bg: '#1a1a2e',
      enable_publishing: false,
      hide_side_toolbar: false,
      allow_symbol_change: true,
      container_id: containerId.current,
      loading_screen: { backgroundColor: '#1a1a2e' },
      overrides: {
        'mainSeriesProperties.candleStyle.upColor': '#00d084',
        'mainSeriesProperties.candleStyle.downColor': '#ff3d57',
        'mainSeriesProperties.candleStyle.borderUpColor': '#00d084',
        'mainSeriesProperties.candleStyle.borderDownColor': '#ff3d57',
        'mainSeriesProperties.candleStyle.wickUpColor': '#00d084',
        'mainSeriesProperties.candleStyle.wickDownColor': '#ff3d57',
      },
    });
  }, [ticker]);

  return (
    <div className="min-h-screen bg-[#0a0e27] text-white">
      {/* Header */}
      <header className="bg-primary border-b border-accent p-4 flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Dashboard
        </button>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold font-mono">{ticker}</h1>
          {earnings && (
            <span
              className={`text-xs font-mono px-2 py-0.5 rounded cursor-help whitespace-nowrap ${
                earnings.daysUntil <= 0
                  ? 'bg-red-900/40 text-red-300 font-semibold'
                  : earnings.daysUntil <= 7
                  ? 'bg-red-900/30 text-red-400'
                  : earnings.daysUntil <= 14
                  ? 'bg-amber-900/30 text-amber-400'
                  : earnings.daysUntil <= 28
                  ? 'bg-yellow-900/30 text-yellow-400'
                  : 'bg-gray-800/40 text-gray-400'
              }`}
              title={`Earnings ${earnings.daysUntil <= 0 ? 'today/just reported' : `in ${earnings.daysUntil} day${earnings.daysUntil !== 1 ? 's' : ''}`} (${new Date(earnings.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${earnings.timing ? ' ' + earnings.timing : ''})`}
            >
              {earnings.daysUntil <= 0 ? 'ER today' : `ER ${earnings.daysUntil}D`}
            </span>
          )}
          <a
            href={`https://www.tradingview.com/chart/?symbol=${ticker}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1"
          >
            TradingView <ExternalLink size={11} />
          </a>
        </div>
      </header>

      {/* TradingView Chart */}
      <div className="p-4 pb-0">
        <div className="bg-primary rounded-lg overflow-hidden border border-accent" style={{ height: '500px' }}>
          <div
            ref={containerRef}
            id={containerId.current}
            className="w-full h-full"
          />
        </div>
      </div>

      {/* Performance Data */}
      <div className="p-4">
        <div className="bg-primary rounded-lg border border-accent overflow-hidden">
          <div className="p-4 border-b border-accent">
            <h2 className="text-lg font-semibold">Performance</h2>
            <p className="text-xs text-gray-500 mt-0.5">Data from Yahoo Finance (15 min delayed)</p>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading performance data...</div>
          ) : !perf ? (
            <div className="p-8 text-center text-gray-500">No performance data available</div>
          ) : (
            <div className="p-4">
              {/* Timeframe performance */}
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
                {TIMEFRAMES.map((tf) => (
                  <div key={tf.key} className="bg-secondary/50 rounded-lg p-3 text-center">
                    <div className="text-xs text-gray-500 mb-1">{tf.label}</div>
                    <div className={`text-lg font-mono font-semibold ${perfCls(perf[tf.key])}`}>
                      {fmt(perf[tf.key])}
                    </div>
                  </div>
                ))}
              </div>

              {/* Volume & RVOL */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <div className="bg-secondary/50 rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-500 mb-1">Volume</div>
                  <div className="text-lg font-mono font-semibold text-gray-300">
                    {fmtVol(perf.volume)}
                  </div>
                </div>
                <div className="bg-secondary/50 rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-500 mb-1">Avg Volume (3M)</div>
                  <div className="text-lg font-mono font-semibold text-gray-300">
                    {fmtVol(perf.avgVolume)}
                  </div>
                </div>
                <div className="bg-secondary/50 rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-500 mb-1 cursor-help" title="Relative Volume — today's volume divided by 3-month average daily volume">RVOL</div>
                  <div className={`text-lg font-mono font-semibold ${
                    perf.relVolume == null ? 'text-gray-500'
                    : perf.relVolume >= 2 ? 'text-success'
                    : perf.relVolume >= 1.5 ? 'text-yellow-400'
                    : 'text-gray-300'
                  }`}>
                    {perf.relVolume != null ? `${perf.relVolume.toFixed(2)}x` : '-'}
                  </div>
                </div>
                <div className="bg-secondary/50 rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-500 mb-1">Price</div>
                  <div className="text-lg font-mono font-semibold text-gray-300">
                    {perf.price != null ? `$${perf.price.toFixed(2)}` : '-'}
                  </div>
                </div>
              </div>

              {/* RS vs SPY */}
              {perf.spyPerf && (
                <div className="bg-secondary/30 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-400 mb-3">Relative Strength vs SPY</h3>
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                    {TIMEFRAMES.map((tf) => {
                      const stockPerf = perf[tf.key];
                      const spy = perf.spyPerf[tf.key];
                      const rs = stockPerf != null && spy != null ? stockPerf - spy : null;
                      return (
                        <div key={tf.key} className="text-center">
                          <div className="text-xs text-gray-500 mb-1">{tf.label}</div>
                          <div className={`text-sm font-mono font-semibold ${perfCls(rs)}`}>
                            {rs != null ? fmt(rs) : '-'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default StockDetail;
