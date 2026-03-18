import { useState, useEffect, useCallback } from 'react';
import ThemeFinder from './components/ThemeFinder';
import StockDetail from './components/StockDetail';
import Home from './components/Home';
import { TrendingUp, Home as HomeIcon } from 'lucide-react';

function App() {
  const [view, setView] = useState('home'); // 'home' | 'themes' | 'sectors'
  const [stockTicker, setStockTicker] = useState(null);

  // Check URL for ?stock=TICKER or ?view= on mount and on popstate
  useEffect(() => {
    const readParams = () => {
      const params = new URLSearchParams(window.location.search);
      const stock = params.get('stock');
      const v = params.get('view');
      if (stock) {
        setStockTicker(stock);
      } else {
        setStockTicker(null);
        if (v === 'themes' || v === 'sectors') setView(v);
        else setView('home');
      }
    };
    readParams();
    window.addEventListener('popstate', readParams);
    return () => window.removeEventListener('popstate', readParams);
  }, []);

  const navigate = useCallback((v) => {
    window.history.pushState({}, '', `${window.location.pathname}?view=${v}`);
    setView(v);
    setStockTicker(null);
  }, []);

  const goHome = useCallback(() => {
    window.history.pushState({}, '', window.location.pathname);
    setView('home');
    setStockTicker(null);
  }, []);

  const handleBack = useCallback(() => {
    window.history.pushState({}, '', window.location.pathname);
    setStockTicker(null);
  }, []);

  // Stock detail page
  if (stockTicker) {
    return <StockDetail ticker={stockTicker} onBack={handleBack} />;
  }

  // Home page
  if (view === 'home') {
    return <Home onNavigate={navigate} />;
  }

  // Theme / Sector finder
  const mode = view === 'sectors' ? 'sectors' : 'themes';

  return (
    <div className="min-h-screen bg-[#0a0e27] text-white">
      {/* Header */}
      <header className="bg-primary border-b border-accent p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={goHome}
            className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors"
            title="Back to Home"
          >
            <HomeIcon size={18} />
          </button>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="text-success" />
            {mode === 'sectors' ? 'Sector Finder' : 'Theme Finder'}
          </h1>
        </div>

        {/* Themes / Sectors pill toggle */}
        <button
          onClick={() => navigate(mode === 'themes' ? 'sectors' : 'themes')}
          className="relative flex items-center rounded-full p-1 bg-secondary border border-accent transition-colors"
          title="Switch between Themes and Sectors"
        >
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
              mode === 'themes'
                ? 'bg-purple-600 text-white shadow'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Themes
          </span>
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
              mode === 'sectors'
                ? 'bg-blue-600 text-white shadow'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Sectors
          </span>
        </button>
      </header>

      {/* Main Content */}
      <main className="p-4">
        <div className="h-[calc(100vh-80px)] min-h-[600px]">
          <ThemeFinder mode={mode} />
        </div>
      </main>
    </div>
  );
}

export default App;
