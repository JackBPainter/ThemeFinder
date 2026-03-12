import { useEffect, useRef } from 'react';

const TradingViewMarketOverview = ({ symbols, listName = 'Watchlist' }) => {
  const containerRef = useRef(null);
  // Track the last key we rendered so React StrictMode's double-invocation
  // doesn't inject a second script before the first one has run
  const renderedKeyRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || symbols.length === 0) return;

    const key = symbols.map(s => s.symbol).join(',') + '|' + listName;

    // Skip if already rendered for this exact symbol list
    if (renderedKeyRef.current === key) return;
    renderedKeyRef.current = key;

    // Clear previous widget
    containerRef.current.innerHTML = '';

    const widgetDiv = document.createElement('div');
    widgetDiv.className = 'tradingview-widget-container__widget';
    widgetDiv.style.height = '100%';
    containerRef.current.appendChild(widgetDiv);

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js';
    script.async = true;
    script.text = JSON.stringify({
      colorTheme: 'dark',
      dateRange: '1D',
      showChart: false,
      locale: 'en',
      width: '100%',
      height: '100%',
      isTransparent: true,
      showSymbolLogo: true,
      showFloatingTooltip: false,
      plotLineColorGrowing: '#00d084',
      plotLineColorFalling: '#ff3d57',
      gridLineColor: '#1a1a2e',
      scaleFontColor: '#787B86',
      belowLineFillColorGrowing: 'rgba(0, 208, 132, 0.12)',
      belowLineFillColorFalling: 'rgba(255, 61, 87, 0.12)',
      belowLineFillColorGrowingBottom: 'rgba(0, 208, 132, 0)',
      belowLineFillColorFallingBottom: 'rgba(255, 61, 87, 0)',
      symbolActiveColor: 'rgba(15, 52, 96, 0.5)',
      tabs: [
        {
          title: listName,
          symbols: symbols.map(s => ({ s: s.symbol, d: s.name || s.symbol })),
          originalTitle: listName,
        },
      ],
    });

    containerRef.current.appendChild(script);

    // When symbols change, reset the key so the next effect run re-renders
    return () => {
      renderedKeyRef.current = null;
    };
  }, [symbols.map(s => s.symbol).join(','), listName]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container w-full h-full"
    />
  );
};

export default TradingViewMarketOverview;
