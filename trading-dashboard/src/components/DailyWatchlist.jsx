import { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronDown, ChevronUp, Crosshair, Pencil, RotateCcw, RefreshCw } from 'lucide-react';
import { runWatchlistPipeline } from '../services/watchlistScoringService';

const ACCOUNT_KEY = 'tf_watchlist_account';
const COLLAPSE_KEY = 'tf_watchlist_collapsed';

const fmt = (v) => (v == null ? '-' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`);
const perfCls = (v) => {
  if (v == null) return 'text-gray-500';
  if (v > 3) return 'text-green-400 font-semibold';
  if (v > 0) return 'text-green-500';
  if (v < -3) return 'text-red-400 font-semibold';
  return 'text-red-500';
};
const scoreCls = (v) => {
  if (v >= 75) return 'text-green-400 font-semibold';
  if (v >= 60) return 'text-amber-400';
  return 'text-red-400';
};
const tierCls = (tier) => {
  if (tier === 'A') return 'bg-green-500/20 text-green-400';
  if (tier === 'B') return 'bg-blue-500/20 text-blue-400';
  return 'bg-gray-500/20 text-gray-400';
};

function getUSMarketPhase() {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric', minute: 'numeric', weekday: 'short',
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date()).map((p) => [p.type, p.value])
  );
  const day = parts.weekday;
  const mins = parseInt(parts.hour, 10) * 60 + parseInt(parts.minute, 10);
  if (day === 'Sat' || day === 'Sun') return 'closed';
  if (mins >= 570 && mins < 960) return 'open'; // 9:30 AM – 4:00 PM ET
  return 'closed';
}

function DailyWatchlist() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === 'true');
  const [accountStr, setAccountStr] = useState(() => localStorage.getItem(ACCOUNT_KEY) || '50000');
  const [editingAccount, setEditingAccount] = useState(false);
  const [accountDraft, setAccountDraft] = useState('');

  const [sortCol, setSortCol] = useState('score');
  const [sortAsc, setSortAsc] = useState(false);

  // User edits (local overrides that reset on data refresh)
  const [overrides, setOverrides] = useState({});
  const [editingCell, setEditingCell] = useState(null); // { ticker, field }
  const [editDraft, setEditDraft] = useState('');

  const account = parseFloat(accountStr) || 50000;
  const marketOpen = getUSMarketPhase() === 'open';

  // Persist collapse state
  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? 'true' : 'false');
  }, [collapsed]);

  // Fetch data
  const refresh = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setOverrides({});

    runWatchlistPipeline((p) => {
      if (!cancelled) setProgress(p);
    })
      .then((result) => {
        if (!cancelled) {
          setItems(result.items);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, []);

  // Initial load
  useEffect(() => {
    const cancel = refresh();
    return cancel;
  }, [refresh]);

  // Account editing
  const startEditAccount = useCallback(() => {
    setAccountDraft(accountStr);
    setEditingAccount(true);
  }, [accountStr]);

  const commitAccount = useCallback(() => {
    const v = parseFloat(accountDraft);
    if (v > 0) {
      setAccountStr(String(v));
      localStorage.setItem(ACCOUNT_KEY, String(v));
    }
    setEditingAccount(false);
  }, [accountDraft]);

  // Cell editing
  const startEdit = useCallback((ticker, field, currentValue) => {
    setEditingCell({ ticker, field });
    setEditDraft(String(currentValue));
  }, []);

  const commitEdit = useCallback(() => {
    if (!editingCell) return;
    const v = parseFloat(editDraft);
    if (v > 0) {
      setOverrides((prev) => ({
        ...prev,
        [editingCell.ticker]: {
          ...(prev[editingCell.ticker] || {}),
          [editingCell.field]: v,
        },
      }));
    }
    setEditingCell(null);
  }, [editingCell, editDraft]);

  const resetField = useCallback((ticker, field) => {
    setOverrides((prev) => {
      const copy = { ...prev };
      if (copy[ticker]) {
        const { [field]: _, ...rest } = copy[ticker];
        if (Object.keys(rest).length === 0) delete copy[ticker];
        else copy[ticker] = rest;
      }
      return copy;
    });
  }, []);

  const getVal = useCallback((item, field) => {
    return overrides[item.ticker]?.[field] ?? item[field];
  }, [overrides]);

  // Sorting
  const toggleSort = useCallback((col) => {
    if (sortCol === col) setSortAsc((prev) => !prev);
    else { setSortCol(col); setSortAsc(false); }
  }, [sortCol]);

  const sortedItems = useMemo(() => {
    const sorted = [...items].sort((a, b) => {
      let va, vb;
      if (sortCol === 'score') { va = a.watchlistScore; vb = b.watchlistScore; }
      else if (sortCol === 'rs') { va = a.rsComposite; vb = b.rsComposite; }
      else if (sortCol === 'rvol') { va = a.rvol; vb = b.rvol; }
      else if (sortCol === '1w') { va = a.perf1W ?? -999; vb = b.perf1W ?? -999; }
      else if (sortCol === 'theme') { return a.themeName.localeCompare(b.themeName) * (sortAsc ? 1 : -1); }
      else return 0;
      return sortAsc ? va - vb : vb - va;
    });
    return sorted;
  }, [items, sortCol, sortAsc]);

  const themeCount = useMemo(() => new Set(items.map((i) => i.themeName)).size, [items]);

  const SortHeader = ({ col, children, className = '' }) => {
    const active = sortCol === col;
    return (
      <th
        className={`py-2 px-2 cursor-pointer select-none whitespace-nowrap transition-colors hover:text-gray-200 ${active ? 'text-gray-200' : 'text-gray-500'} ${className}`}
        onClick={() => toggleSort(col)}
      >
        <span className="inline-flex items-center gap-0.5">
          {children}
          {active && (sortAsc ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
        </span>
      </th>
    );
  };

  // Editable cell renderer
  const EditableCell = ({ item, field, prefix = '$' }) => {
    const isEditing = editingCell?.ticker === item.ticker && editingCell?.field === field;
    const hasOverride = overrides[item.ticker]?.[field] != null;
    const value = getVal(item, field);

    if (isEditing) {
      return (
        <td className="py-1.5 px-2 text-right">
          <input
            type="text"
            inputMode="numeric"
            autoFocus
            value={editDraft}
            onChange={(e) => setEditDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingCell(null); }}
            className="w-20 bg-accent/30 border border-accent rounded px-1.5 py-0.5 text-right text-xs font-mono text-white focus:outline-none focus:border-blue-500/50"
          />
        </td>
      );
    }

    return (
      <td
        className="py-1.5 px-2 text-right font-mono text-gray-300 cursor-pointer hover:text-white transition-colors group"
        onClick={() => startEdit(item.ticker, field, value)}
      >
        <span className="inline-flex items-center gap-1">
          {hasOverride && (
            <button
              onClick={(e) => { e.stopPropagation(); resetField(item.ticker, field); }}
              className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-amber-400 transition-all"
              title="Reset to auto-calculated"
            >
              <RotateCcw size={9} />
            </button>
          )}
          <span className={hasOverride ? 'text-blue-300' : ''}>
            {prefix}{value.toFixed(2)}
          </span>
        </span>
      </td>
    );
  };

  // Compute shares/risk for display
  const computePosition = (item) => {
    const entry = getVal(item, 'entry');
    const stop = getVal(item, 'stopLoss');
    const riskPerShare = Math.abs(entry - stop);
    if (riskPerShare <= 0) return { shares: 0, dollarRisk: 0 };
    const dollarRisk = account * item.riskPct;
    const shares = Math.floor(dollarRisk / riskPerShare);
    return { shares, dollarRisk: shares * riskPerShare };
  };

  return (
    <div className="bg-secondary/40 rounded-xl border border-accent/40 overflow-hidden">
      {/* Header */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setCollapsed((p) => !p)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCollapsed((p) => !p); } }}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-accent/10 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <Crosshair size={16} className="text-amber-400" />
          <span className="text-sm font-semibold text-gray-200">
            Daily Watchlist
          </span>
          {!loading && items.length > 0 && (
            <span className="text-[11px] text-gray-500">
              {items.length} stock{items.length !== 1 ? 's' : ''} from {themeCount} theme{themeCount !== 1 ? 's' : ''}
            </span>
          )}
          {loading && progress && (
            <span className="text-[11px] text-gray-600">
              {progress.phase === 'themes' ? 'Loading themes...' : `Scoring ${progress.loaded}/${progress.total} stocks...`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {/* Account */}
          {!collapsed && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400" onClick={(e) => e.stopPropagation()}>
              <span>Account:</span>
              {editingAccount ? (
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  value={accountDraft}
                  onChange={(e) => setAccountDraft(e.target.value)}
                  onBlur={commitAccount}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitAccount(); if (e.key === 'Escape') setEditingAccount(false); }}
                  className="w-24 bg-accent/30 border border-accent rounded px-1.5 py-0.5 text-xs font-mono text-white focus:outline-none focus:border-blue-500/50"
                />
              ) : (
                <button
                  onClick={startEditAccount}
                  className="inline-flex items-center gap-1 font-mono text-gray-300 hover:text-white transition-colors"
                >
                  ${parseFloat(accountStr).toLocaleString()}
                  <Pencil size={10} className="text-gray-600" />
                </button>
              )}
            </div>
          )}
          {!collapsed && (
            <button
              onClick={(e) => { e.stopPropagation(); if (!loading) refresh(); }}
              disabled={loading}
              className="text-gray-500 hover:text-amber-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Refresh watchlist"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          )}
          {collapsed ? <ChevronDown size={16} className="text-gray-500" /> : <ChevronUp size={16} className="text-gray-500" />}
        </div>
      </div>

      {/* Body */}
      {!collapsed && (
        <div className="px-5 pb-4">
          {/* Loading skeleton */}
          {loading && (
            <div className="space-y-2 py-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-8 bg-accent/20 rounded animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
              ))}
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="py-6 text-center text-sm text-red-400/80">{error}</div>
          )}

          {/* Empty state */}
          {!loading && !error && items.length === 0 && (
            <div className="py-8 text-center">
              <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
                No high-conviction setups found today. All top themes are either decelerating or fail the minimum criteria. Consider sitting in cash per strategy rules.
              </p>
            </div>
          )}

          {/* Table */}
          {!loading && !error && items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-accent/30">
                    <th className="py-2 px-2 text-left text-gray-500 w-5">#</th>
                    <th className="py-2 px-2 text-left text-gray-500">Ticker</th>
                    <SortHeader col="theme" className="text-left">Theme</SortHeader>
                    <SortHeader col="score" className="text-right">Score</SortHeader>
                    <SortHeader col="rs" className="text-right">RS</SortHeader>
                    <SortHeader col="rvol" className="text-right">RVOL</SortHeader>
                    <SortHeader col="1w" className="text-right">1W %</SortHeader>
                    {marketOpen && <>
                      <th className="py-2 px-2 text-right text-gray-500">Entry</th>
                      <th className="py-2 px-2 text-right text-gray-500">Stop</th>
                      <th className="py-2 px-2 text-right text-gray-500">T1</th>
                      <th className="py-2 px-2 text-right text-gray-500 hidden md:table-cell">T2</th>
                      <th className="py-2 px-2 text-right text-gray-500 hidden md:table-cell">Shares</th>
                      <th className="py-2 px-2 text-right text-gray-500 hidden md:table-cell">$ Risk</th>
                    </>}
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.map((item, i) => {
                    const pos = computePosition(item);
                    return (
                      <tr key={item.ticker} className="border-b border-accent/10 hover:bg-accent/10 transition-colors">
                        <td className="py-1.5 px-2 text-gray-600 font-mono">{i + 1}</td>
                        <td className="py-1.5 px-2">
                          <a
                            href={`?stock=${item.ticker}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono font-semibold text-gray-200 hover:text-white px-1 py-0.5 rounded hover:bg-accent/30 transition-colors"
                          >
                            {item.ticker}
                          </a>
                        </td>
                        <td className="py-1.5 px-2">
                          <span className="text-gray-400 text-[11px]">{item.themeName}</span>
                          <span
                            className={`ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full cursor-help ${tierCls(item.themeTier)}`}
                            title={"Tier " + item.themeTier + " — based on theme momentum rank + acceleration.\n\nA (Primary): Rank 1–3 with strong acceleration (≥0.02). Risk: 1.5% per trade.\nB (Secondary): Rank 4–7 with positive acceleration. Risk: 1.0% per trade.\nC (Speculative): Rank 8–10 with any positive acceleration. Risk: 0.5% per trade."}
                          >
                            {item.themeTier}
                          </span>
                        </td>
                        <td className={`py-1.5 px-2 text-right font-mono ${scoreCls(item.watchlistScore)}`}>
                          {item.watchlistScore.toFixed(1)}
                        </td>
                        <td className={`py-1.5 px-2 text-right font-mono ${perfCls(item.rsComposite)}`}>
                          {item.rsComposite}
                        </td>
                        <td className={`py-1.5 px-2 text-right font-mono ${
                          item.rvol >= 3 ? 'text-yellow-400 font-semibold' :
                          item.rvol >= 2 ? 'text-green-400' :
                          item.rvol >= 1.5 ? 'text-green-500' : 'text-gray-500'
                        }`}>
                          {item.rvol.toFixed(1)}x
                        </td>
                        <td className={`py-1.5 px-2 text-right font-mono ${perfCls(item.perf1W)}`}>
                          {fmt(item.perf1W)}
                        </td>
                        {marketOpen && <>
                          <EditableCell item={item} field="entry" />
                          <EditableCell item={item} field="stopLoss" />
                          <EditableCell item={item} field="target1" />
                          <td className="py-1.5 px-2 text-right font-mono text-gray-300 hidden md:table-cell cursor-pointer hover:text-white transition-colors"
                            onClick={() => startEdit(item.ticker, 'target2', getVal(item, 'target2'))}
                          >
                            <span className={overrides[item.ticker]?.target2 != null ? 'text-blue-300' : ''}>
                              ${getVal(item, 'target2').toFixed(2)}
                            </span>
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono text-gray-400 hidden md:table-cell">
                            {pos.shares.toLocaleString()}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono text-red-400 hidden md:table-cell">
                            ${pos.dollarRisk.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </td>
                        </>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default DailyWatchlist;
