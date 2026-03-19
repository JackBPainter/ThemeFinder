import { useState, useEffect } from 'react';
import { fetchMarketData, classifyRegime } from '../services/marketRegimeService';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Shield, Target } from 'lucide-react';

const fmt = (v, decimals = 2) => (v == null ? '-' : v.toFixed(decimals));
const sign = (v) => (v == null ? '' : v >= 0 ? '+' : '');

const REGIME_STYLES = {
  success: { bg: 'bg-green-900/30', border: 'border-green-500/40', text: 'text-green-400', badge: 'bg-green-500/20 text-green-400' },
  warning: { bg: 'bg-yellow-900/30', border: 'border-yellow-500/40', text: 'text-yellow-400', badge: 'bg-yellow-500/20 text-yellow-400' },
  danger:  { bg: 'bg-red-900/30',    border: 'border-red-500/40',    text: 'text-red-400',    badge: 'bg-red-500/20 text-red-400' },
};

function MarketRegimeBar() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const result = await fetchMarketData();
        if (!cancelled) {
          setData(result);
          setError(!result.spy && !result.vix);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    };

    load();

    // Refresh every 60s
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (error && !data) return null;
  if (!data) {
    return (
      <div className="bg-secondary/50 border-b border-accent/30 px-4 py-2 text-center text-xs text-gray-500">
        Loading market data...
      </div>
    );
  }

  const { spy, nasdaq, vix } = data;
  const regime = classifyRegime(spy, vix);
  const style = regime ? REGIME_STYLES[regime.color] : null;

  const SpyIcon = spy?.changePct > 0.1 ? TrendingUp : spy?.changePct < -0.1 ? TrendingDown : Minus;
  const spyColor = spy?.changePct > 0 ? 'text-success' : spy?.changePct < 0 ? 'text-danger' : 'text-gray-400';
  const NasdaqIcon = nasdaq?.changePct > 0.1 ? TrendingUp : nasdaq?.changePct < -0.1 ? TrendingDown : Minus;
  const nasdaqColor = nasdaq?.changePct > 0 ? 'text-success' : nasdaq?.changePct < 0 ? 'text-danger' : 'text-gray-400';
  const vixColor = vix?.price >= 30 ? 'text-red-400' : vix?.price >= 20 ? 'text-yellow-400' : 'text-green-400';

  return (
    <div className={`${style?.bg ?? 'bg-secondary/50'} border-b ${style?.border ?? 'border-accent/30'} px-4 py-2`}>
      <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-x-6 gap-y-1">
        {/* Left: SPY + VIX */}
        <div className="flex items-center gap-5 text-xs">
          {/* SPY */}
          <div className="flex items-center gap-2">
            <span className="text-gray-500 font-medium">S&P 500</span>
            {spy ? (
              <>
                <SpyIcon size={13} className={spyColor} />
                <span className={`font-mono font-semibold ${spyColor}`}>
                  {fmt(spy.price, 2)}
                </span>
                <span className={`font-mono ${spyColor}`}>
                  {sign(spy.changePct)}{fmt(spy.changePct)}%
                </span>
              </>
            ) : (
              <span className="text-gray-600">—</span>
            )}
          </div>

          {/* Divider */}
          <span className="text-gray-700">|</span>

          {/* Nasdaq */}
          <div className="flex items-center gap-2">
            <span className="text-gray-500 font-medium">Nasdaq</span>
            {nasdaq ? (
              <>
                <NasdaqIcon size={13} className={nasdaqColor} />
                <span className={`font-mono font-semibold ${nasdaqColor}`}>
                  {fmt(nasdaq.price, 2)}
                </span>
                <span className={`font-mono ${nasdaqColor}`}>
                  {sign(nasdaq.changePct)}{fmt(nasdaq.changePct)}%
                </span>
              </>
            ) : (
              <span className="text-gray-600">—</span>
            )}
          </div>

          {/* Divider */}
          <span className="text-gray-700">|</span>

          {/* VIX */}
          <div className="flex items-center gap-2" title="CBOE Volatility Index — measures expected 30-day S&P 500 volatility. Below 20: low fear (green). 20–30: elevated uncertainty (yellow). Above 30: high fear / stress (red).">
            <span className="text-gray-500 font-medium">VIX</span>
            {vix ? (
              <>
                <AlertTriangle size={12} className={vixColor} />
                <span className={`font-mono font-semibold ${vixColor}`}>
                  {fmt(vix.price, 2)}
                </span>
                {vix.changePct != null && (
                  <span className={`font-mono ${vix.changePct >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {sign(vix.changePct)}{fmt(vix.changePct)}%
                  </span>
                )}
              </>
            ) : (
              <span className="text-gray-600">—</span>
            )}
          </div>
        </div>

        {/* Center: Regime badge */}
        {regime && (
          <div
            className={`px-3 py-0.5 rounded-full text-xs font-bold cursor-default ${style.badge}`}
            title={`Regime: ${regime.regime}\n\nBull: VIX < 20 AND S&P 500 change >= 0%\nBear: VIX > 30 OR S&P 500 change < -1%\nChoppy: everything else\n\nCurrent: VIX ${fmt(vix?.price)} | S&P ${sign(spy?.changePct)}${fmt(spy?.changePct)}%`}
          >
            {regime.regime === 'Bull' && <TrendingUp size={11} className="inline mr-1 -mt-0.5" />}
            {regime.regime === 'Bear' && <TrendingDown size={11} className="inline mr-1 -mt-0.5" />}
            {regime.regime === 'Choppy' && <Minus size={11} className="inline mr-1 -mt-0.5" />}
            {regime.regime}
          </div>
        )}

        {/* Right: Risk guidance */}
        {regime && (
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5 text-gray-400" title="Suggested maximum risk per trade based on current regime">
              <Shield size={12} className={style.text} />
              <span>Risk/Trade:</span>
              <span className={`font-mono font-semibold ${style.text}`}>{regime.riskPct}%</span>
            </div>
            <div className="flex items-center gap-1.5 text-gray-400" title="Suggested maximum simultaneous open positions based on current regime">
              <Target size={12} className={style.text} />
              <span>Max Positions:</span>
              <span className={`font-mono font-semibold ${style.text}`}>{regime.maxPositions}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default MarketRegimeBar;
