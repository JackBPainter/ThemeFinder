import { useEffect, useRef } from 'react';

// Module-level counter: each component mount gets a unique container ID.
// This ensures the old widget (rendering into a now-detached element) and
// the new widget (rendering into the fresh container) never share a container.
let instanceCount = 0;

const TradingViewChart = ({ symbol = 'NASDAQ:AAPL', theme = 'dark' }) => {
  const containerRef = useRef(null);
  const containerId = useRef(`tv_chart_${++instanceCount}`);
  const initialized = useRef(false);

  const displaySymbol = symbol.includes(':') ? symbol.split(':')[1] : symbol;

  useEffect(() => {
    if (!containerRef.current || initialized.current || !window.TradingView) return;
    if (!document.getElementById(containerId.current)) return;

    initialized.current = true;

    new window.TradingView.widget({
      autosize: true,
      symbol,
      interval: 'D',
      timezone: 'Etc/UTC',
      theme,
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

    // No cleanup: clearing innerHTML while TradingView is async-initialising
    // causes a crash in its internal code. Instead we let React remove the old
    // container element from the DOM; the old widget finishes initialising into
    // a now-detached element (invisible, silent) while the new widget renders
    // into the fresh container.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bg-primary rounded-lg overflow-hidden h-full flex flex-col">
      <div className="p-4 border-b border-accent flex items-center gap-3">
        <h2 className="text-xl font-bold">Chart</h2>
        <span className="text-sm font-semibold bg-accent px-2 py-0.5 rounded text-white">
          {displaySymbol}
        </span>
      </div>
      <div
        ref={containerRef}
        id={containerId.current}
        className="flex-1"
      />
    </div>
  );
};

export default TradingViewChart;
