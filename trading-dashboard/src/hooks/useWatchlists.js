import { useState, useEffect } from 'react';

const STORAGE_KEY = 'trading_watchlists';

const defaultWatchlists = [
  {
    id: '1',
    name: 'Main Watchlist',
    symbols: [
      { symbol: 'NASDAQ:AAPL', name: 'Apple Inc.' },
      { symbol: 'NASDAQ:MSFT', name: 'Microsoft Corp.' },
      { symbol: 'NASDAQ:GOOGL', name: 'Alphabet Inc.' },
      { symbol: 'NYSE:TSLA', name: 'Tesla Inc.' },
      { symbol: 'NASDAQ:NVDA', name: 'NVIDIA Corp.' },
      { symbol: 'NASDAQ:AMZN', name: 'Amazon.com Inc.' }
    ]
  }
];

export const useWatchlists = () => {
  const [watchlists, setWatchlists] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : defaultWatchlists;
  });

  const [activeWatchlistId, setActiveWatchlistId] = useState(() => {
    return watchlists[0]?.id || null;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlists));
  }, [watchlists]);

  const addWatchlist = (name) => {
    const newWatchlist = {
      id: Date.now().toString(),
      name,
      symbols: []
    };
    setWatchlists([...watchlists, newWatchlist]);
    setActiveWatchlistId(newWatchlist.id);
  };

  const removeWatchlist = (id) => {
    const filtered = watchlists.filter(w => w.id !== id);
    setWatchlists(filtered);
    if (activeWatchlistId === id && filtered.length > 0) {
      setActiveWatchlistId(filtered[0].id);
    }
  };

  const renameWatchlist = (id, newName) => {
    setWatchlists(watchlists.map(w =>
      w.id === id ? { ...w, name: newName } : w
    ));
  };

  const addSymbol = (watchlistId, symbol, name) => {
    setWatchlists(watchlists.map(w => {
      if (w.id === watchlistId) {
        const exists = w.symbols.some(s => s.symbol === symbol.toUpperCase());
        if (!exists) {
          return {
            ...w,
            symbols: [...w.symbols, { symbol: symbol.toUpperCase(), name }]
          };
        }
      }
      return w;
    }));
  };

  const removeSymbol = (watchlistId, symbol) => {
    setWatchlists(watchlists.map(w => {
      if (w.id === watchlistId) {
        return {
          ...w,
          symbols: w.symbols.filter(s => s.symbol !== symbol)
        };
      }
      return w;
    }));
  };

  const exportWatchlist = (watchlistId) => {
    const watchlist = watchlists.find(w => w.id === watchlistId);
    if (!watchlist) return;

    const csvContent = [
      'Symbol,Name',
      ...watchlist.symbols.map(s => `${s.symbol},${s.name}`)
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${watchlist.name.replace(/\s+/g, '_')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importWatchlist = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target.result;
          const lines = text.split('\n').filter(line => line.trim());
          const symbols = lines.slice(1).map(line => {
            const [symbol, name] = line.split(',');
            return { symbol: symbol.trim(), name: name?.trim() || symbol.trim() };
          });

          const newWatchlist = {
            id: Date.now().toString(),
            name: file.name.replace('.csv', ''),
            symbols
          };

          setWatchlists([...watchlists, newWatchlist]);
          setActiveWatchlistId(newWatchlist.id);
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  };

  const activeWatchlist = watchlists.find(w => w.id === activeWatchlistId);

  return {
    watchlists,
    activeWatchlist,
    activeWatchlistId,
    setActiveWatchlistId,
    addWatchlist,
    removeWatchlist,
    renameWatchlist,
    addSymbol,
    removeSymbol,
    exportWatchlist,
    importWatchlist
  };
};
