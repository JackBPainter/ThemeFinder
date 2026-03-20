import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Calculator, Save, Info, DollarSign, Shield, BarChart3, Target, RefreshCw } from 'lucide-react';
import { fetchMarketData, classifyRegime } from '../services/marketRegimeService';

const TIERS = [
  { label: 'Full', multiplier: 1.0 },
  { label: '¾', multiplier: 0.75 },
  { label: '½', multiplier: 0.5 },
  { label: '¼', multiplier: 0.25 },
];

const CURRENCIES = [
  { key: 'USD', symbol: '$', label: 'Dollar' },
  { key: 'GBP', symbol: '£', label: 'Pound' },
  { key: 'EUR', symbol: '€', label: 'Euro' },
];

const STORAGE_KEY = 'td_account_value';
const CURRENCY_KEY = 'td_currency';

function PositionSizer({ onBack }) {
  const [prefillTicker] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('ticker') || '';
  });
  const [accountValue, setAccountValue] = useState('');
  const [saved, setSaved] = useState(false);
  const [riskPct, setRiskPct] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [stopPrice, setStopPrice] = useState('');
  const [tier, setTier] = useState(0);
  const [regimeRisk, setRegimeRisk] = useState(null);
  const [currIdx, setCurrIdx] = useState(0);
  const [fxRate, setFxRate] = useState('');       // how many local units per 1 USD
  const [fxLoading, setFxLoading] = useState(false);

  const isUsd = CURRENCIES[currIdx].key === 'USD';
  const cs = CURRENCIES[currIdx].symbol;

  // Load account value + currency from localStorage, and URL params for pre-fill
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) { setAccountValue(stored); setSaved(true); }
    const storedCurr = localStorage.getItem(CURRENCY_KEY);
    if (storedCurr) {
      const idx = CURRENCIES.findIndex((c) => c.key === storedCurr);
      if (idx >= 0) setCurrIdx(idx);
    }
    // Pre-fill entry price from URL
    const params = new URLSearchParams(window.location.search);
    const urlEntry = params.get('entry');
    if (urlEntry && !isNaN(parseFloat(urlEntry))) setEntryPrice(urlEntry);
  }, []);

  // Fetch regime risk default
  useEffect(() => {
    let cancelled = false;
    fetchMarketData().then((data) => {
      if (cancelled) return;
      const regime = classifyRegime(data.spy, data.vix);
      if (regime) {
        setRegimeRisk(regime.riskPct);
        setRiskPct((prev) => prev || String(regime.riskPct));
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Fetch FX rate when currency changes
  useEffect(() => {
    if (isUsd) { setFxRate(''); return; }
    let cancelled = false;
    setFxLoading(true);
    const curr = CURRENCIES[currIdx].key;
    fetch(`https://api.frankfurter.app/latest?from=USD&to=${curr}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.rates?.[curr]) {
          setFxRate(String(d.rates[curr]));
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setFxLoading(false); });
    return () => { cancelled = true; };
  }, [currIdx, isUsd]);

  const saveAccount = useCallback(() => {
    const v = parseFloat(accountValue);
    if (!v || v <= 0) return;
    localStorage.setItem(STORAGE_KEY, accountValue);
    localStorage.setItem(CURRENCY_KEY, CURRENCIES[currIdx].key);
    setSaved(true);
  }, [accountValue, currIdx]);

  const clearAccount = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(CURRENCY_KEY);
    setSaved(false);
  }, []);

  // Calculations — entry/stop are always USD; convert account to USD for sizing
  const account = parseFloat(accountValue) || 0;
  const rate = parseFloat(fxRate) || 0;
  const accountUsd = isUsd ? account : (rate > 0 ? account / rate : 0);
  const risk = parseFloat(riskPct) || 0;
  const entry = parseFloat(entryPrice) || 0;
  const stop = parseFloat(stopPrice) || 0;
  const riskPerShare = entry && stop ? Math.abs(entry - stop) : 0;
  const dollarRiskFull = accountUsd * (risk / 100);
  const dollarRiskTiered = dollarRiskFull * TIERS[tier].multiplier;
  const shares = riskPerShare > 0 ? Math.floor(dollarRiskTiered / riskPerShare) : 0;
  const positionValue = shares * entry;
  const portfolioPct = accountUsd > 0 ? (positionValue / accountUsd) * 100 : 0;
  const actualDollarRisk = shares * riskPerShare;

  const isValid = accountUsd > 0 && risk > 0 && entry > 0 && stop > 0 && entry !== stop;
  const isLong = entry > stop;

  // Helpers for dual-currency display
  const toLocal = (usd) => rate > 0 ? usd * rate : 0;
  const fmtMoney = (v) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const localSub = (usd) => !isUsd && rate > 0 ? `${cs}${fmtMoney(toLocal(usd))}` : null;

  return (
    <div className="min-h-screen bg-[#0a0e27] text-white">
      <header className="bg-primary border-b border-accent p-4 flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Dashboard
        </button>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Calculator className="text-emerald-400" />
          Position Sizer
          {prefillTicker && (
            <span className="text-lg font-mono text-gray-400">— {prefillTicker}</span>
          )}
        </h1>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">

        {/* Account Value */}
        <div className="bg-secondary/60 rounded-xl border border-accent/40 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <label className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                <DollarSign size={14} className="text-emerald-400" />
                Account Value
              </label>
              <div className="flex rounded-md overflow-hidden border border-accent/60">
                {CURRENCIES.map((c, i) => (
                  <button
                    key={c.key}
                    onClick={() => { setCurrIdx(i); setSaved(false); }}
                    className={`px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                      currIdx === i
                        ? 'bg-emerald-600/30 text-emerald-300'
                        : 'bg-transparent text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {c.symbol} {c.key}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {saved && (
                <span className="text-[10px] text-emerald-400/70 font-medium bg-emerald-500/10 px-2 py-0.5 rounded">
                  Saved
                </span>
              )}
              <button
                onClick={saveAccount}
                disabled={!accountValue || parseFloat(accountValue) <= 0}
                className="text-xs text-gray-400 hover:text-emerald-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
                title="Save to browser storage"
              >
                <Save size={12} />
                Save
              </button>
              {saved && (
                <button
                  onClick={clearAccount}
                  className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-mono text-sm">{cs}</span>
            <input
              type="number"
              value={accountValue}
              onChange={(e) => { setAccountValue(e.target.value); setSaved(false); }}
              placeholder="e.g. 50000"
              className="w-full pl-8 pr-4 py-2.5 rounded-lg bg-[#0a0e27] border border-accent text-sm font-mono text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
            />
          </div>
          {/* USD equivalent */}
          {!isUsd && account > 0 && rate > 0 && (
            <p className="text-[11px] text-emerald-400/60 font-mono mt-1.5">
              = ${fmtMoney(accountUsd)} USD
            </p>
          )}
          <div className="flex items-start gap-1.5 mt-2.5">
            <Info size={12} className="text-gray-600 mt-0.5 shrink-0" />
            <p className="text-[11px] text-gray-600 leading-relaxed">
              Your account value is stored locally in your browser (localStorage) and never sent to any server.
              Click <strong className="text-gray-500">Save</strong> to persist it across sessions. Use <strong className="text-gray-500">Clear</strong> to remove it.
            </p>
          </div>
        </div>

        {/* FX Rate (non-USD only) */}
        {!isUsd && (
          <div className="bg-secondary/60 rounded-xl border border-accent/40 p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                <RefreshCw size={14} className={`text-cyan-400 ${fxLoading ? 'animate-spin' : ''}`} />
                Exchange Rate
                <span className="text-[11px] font-normal text-gray-500">1 USD = ? {CURRENCIES[currIdx].key}</span>
              </label>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-mono text-sm">{cs}</span>
              <input
                type="number"
                step="0.0001"
                value={fxRate}
                onChange={(e) => setFxRate(e.target.value)}
                placeholder={fxLoading ? 'Fetching...' : '0.0000'}
                className="w-full pl-8 pr-4 py-2.5 rounded-lg bg-[#0a0e27] border border-accent text-sm font-mono text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 transition-colors"
              />
            </div>
            <div className="flex items-start gap-1.5 mt-2.5">
              <Info size={12} className="text-gray-600 mt-0.5 shrink-0" />
              <p className="text-[11px] text-gray-600 leading-relaxed">
                Rate auto-fetched from ECB via Frankfurter API. Edit manually if your broker uses a different rate.
                All stock prices below are in USD — this rate converts your account value and results.
              </p>
            </div>
          </div>
        )}

        {/* Risk & Tier Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Risk Per Trade */}
          <div className="bg-secondary/60 rounded-xl border border-accent/40 p-5">
            <label
              className="text-sm font-semibold text-gray-300 flex items-center gap-2 mb-3 cursor-help"
              title={"Suggested maximum risk per trade based on current market regime.\n\nBull: 1.0% — VIX < 20 and S&P 500 positive\nChoppy: 0.75% — neither bull nor bear\nBear: 0.5% — VIX > 30 or S&P 500 < -1%"}
            >
              <Shield size={14} className="text-yellow-400" />
              Risk Per Trade
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.05"
                value={riskPct}
                onChange={(e) => setRiskPct(e.target.value)}
                placeholder="1.0"
                className="w-full pr-8 pl-4 py-2.5 rounded-lg bg-[#0a0e27] border border-accent text-sm font-mono text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500/50 transition-colors"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 font-mono text-sm">%</span>
            </div>
            {regimeRisk != null && (
              <p className="text-[11px] text-gray-600 mt-2">
                Regime default: <button onClick={() => setRiskPct(String(regimeRisk))} className="text-yellow-500/70 hover:text-yellow-400 underline underline-offset-2 transition-colors">{regimeRisk}%</button>
              </p>
            )}
          </div>

          {/* Tier */}
          <div className="bg-secondary/60 rounded-xl border border-accent/40 p-5">
            <label className="text-sm font-semibold text-gray-300 flex items-center gap-2 mb-3">
              <Target size={14} className="text-blue-400" />
              Position Tier
            </label>
            <div className="grid grid-cols-4 gap-2">
              {TIERS.map((t, i) => (
                <button
                  key={t.label}
                  onClick={() => setTier(i)}
                  className={`py-2.5 rounded-lg text-sm font-medium transition-all ${
                    tier === i
                      ? 'bg-blue-600/30 border border-blue-500/50 text-blue-300'
                      : 'bg-[#0a0e27] border border-accent text-gray-500 hover:text-gray-300 hover:border-gray-600'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-600 mt-2">
              Scales risk allocation — {TIERS[tier].label} = {(TIERS[tier].multiplier * 100).toFixed(0)}% of max risk
            </p>
          </div>
        </div>

        {/* Entry & Stop — always USD since US stocks */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-secondary/60 rounded-xl border border-accent/40 p-5">
            <label className="text-sm font-semibold text-gray-300 mb-3 block">
              Entry Price {!isUsd && <span className="text-[10px] text-gray-500 font-normal ml-1">USD</span>}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-mono text-sm">$</span>
              <input
                type="number"
                step="0.01"
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                placeholder="0.00"
                className="w-full pl-8 pr-4 py-2.5 rounded-lg bg-[#0a0e27] border border-accent text-sm font-mono text-white placeholder-gray-600 focus:outline-none focus:border-gray-500 transition-colors"
              />
            </div>
            {!isUsd && entry > 0 && rate > 0 && (
              <p className="text-[11px] text-gray-500/60 font-mono mt-1.5">= {cs}{fmtMoney(toLocal(entry))}</p>
            )}
          </div>
          <div className="bg-secondary/60 rounded-xl border border-accent/40 p-5">
            <label className="text-sm font-semibold text-gray-300 mb-3 block">
              Stop Loss {!isUsd && <span className="text-[10px] text-gray-500 font-normal ml-1">USD</span>}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-mono text-sm">$</span>
              <input
                type="number"
                step="0.01"
                value={stopPrice}
                onChange={(e) => setStopPrice(e.target.value)}
                placeholder="0.00"
                className="w-full pl-8 pr-4 py-2.5 rounded-lg bg-[#0a0e27] border border-accent text-sm font-mono text-white placeholder-gray-600 focus:outline-none focus:border-gray-500 transition-colors"
              />
            </div>
            {!isUsd && stop > 0 && rate > 0 && (
              <p className="text-[11px] text-gray-500/60 font-mono mt-1.5">= {cs}{fmtMoney(toLocal(stop))}</p>
            )}
          </div>
        </div>

        {/* Results */}
        {isValid && (
          <div className="bg-secondary/60 rounded-xl border border-accent/40 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
              <BarChart3 size={14} className="text-emerald-400" />
              Position Summary
              <span className={`ml-2 text-[10px] font-medium px-2 py-0.5 rounded ${isLong ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                {isLong ? 'LONG' : 'SHORT'}
              </span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <ResultCard label="Shares" value={shares.toLocaleString()} sub={`${TIERS[tier].label} tier`} />
              <ResultCard
                label="Risk"
                value={`$${fmtMoney(actualDollarRisk)}`}
                sub={localSub(actualDollarRisk) || `of $${fmtMoney(dollarRiskFull)} max`}
                sub2={!isUsd && rate > 0 ? `of $${fmtMoney(dollarRiskFull)} max` : null}
              />
              <ResultCard
                label="Position Value"
                value={`$${fmtMoney(positionValue)}`}
                sub={localSub(positionValue) || `${portfolioPct.toFixed(1)}% of portfolio`}
                sub2={!isUsd && rate > 0 ? `${portfolioPct.toFixed(1)}% of portfolio` : null}
              />
              <ResultCard
                label="Risk Per Share"
                value={`$${riskPerShare.toFixed(2)}`}
                sub={localSub(riskPerShare) || `${((riskPerShare / entry) * 100).toFixed(1)}% from entry`}
                sub2={!isUsd && rate > 0 ? `${((riskPerShare / entry) * 100).toFixed(1)}% from entry` : null}
              />
              <ResultCard
                label="Reward (2R)"
                value={`$${fmtMoney(shares * riskPerShare * 2)} profit`}
                sub={`Target: $${(entry + (isLong ? 1 : -1) * riskPerShare * 2).toFixed(2)}${!isUsd && rate > 0 ? ` (${cs}${fmtMoney(toLocal(entry + (isLong ? 1 : -1) * riskPerShare * 2))})` : ''}`}
                sub2={localSub(shares * riskPerShare * 2) ? `${localSub(shares * riskPerShare * 2)} profit` : null}
                title={"2R — twice your risk per share. If your risk is $" + riskPerShare.toFixed(2) + " per share, 2R targets $" + (riskPerShare * 2).toFixed(2) + " profit per share, giving a 2:1 reward-to-risk ratio."}
              />
              <ResultCard
                label="Reward (3R)"
                value={`$${fmtMoney(shares * riskPerShare * 3)} profit`}
                sub={`Target: $${(entry + (isLong ? 1 : -1) * riskPerShare * 3).toFixed(2)}${!isUsd && rate > 0 ? ` (${cs}${fmtMoney(toLocal(entry + (isLong ? 1 : -1) * riskPerShare * 3))})` : ''}`}
                sub2={localSub(shares * riskPerShare * 3) ? `${localSub(shares * riskPerShare * 3)} profit` : null}
                title={"3R — three times your risk per share. If your risk is $" + riskPerShare.toFixed(2) + " per share, 3R targets $" + (riskPerShare * 3).toFixed(2) + " profit per share, giving a 3:1 reward-to-risk ratio."}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ResultCard({ label, value, sub, sub2, title }) {
  return (
    <div className={`bg-[#0a0e27] rounded-lg border border-accent/30 p-3${title ? ' cursor-help' : ''}`} title={title}>
      <div className="text-[11px] text-gray-500 mb-1">{label}</div>
      <div className="text-lg font-bold font-mono text-white">{value}</div>
      {sub && <div className="text-[11px] text-gray-600 mt-0.5">{sub}</div>}
      {sub2 && <div className="text-[11px] text-gray-600/50 mt-0.5">{sub2}</div>}
    </div>
  );
}

export default PositionSizer;
