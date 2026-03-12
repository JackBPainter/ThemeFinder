import { useState, useRef } from 'react';
import { Trash2, Plus, Download, Upload, Edit2, Check, X } from 'lucide-react';
import TradingViewMarketOverview from './TradingViewMarketOverview';

const Watchlist = ({
  watchlist,
  watchlists,
  activeWatchlistId,
  onWatchlistChange,
  onAddSymbol,
  onRemoveSymbol,
  onAddWatchlist,
  onRemoveWatchlist,
  onRenameWatchlist,
  onExport,
  onImport,
  onSymbolClick
}) => {
  const [newSymbol, setNewSymbol] = useState('');
  const [newSymbolName, setNewSymbolName] = useState('');
  const [newWatchlistName, setNewWatchlistName] = useState('');
  const [showNewWatchlistInput, setShowNewWatchlistInput] = useState(false);
  const [editingWatchlistId, setEditingWatchlistId] = useState(null);
  const [editName, setEditName] = useState('');
  const fileInputRef = useRef(null);

  // Normalise symbol: if no exchange prefix, assume NASDAQ
  const normaliseSymbol = (raw) => {
    const upper = raw.trim().toUpperCase();
    return upper.includes(':') ? upper : `NASDAQ:${upper}`;
  };

  const handleAddSymbol = (e) => {
    e.preventDefault();
    if (newSymbol.trim() && watchlist) {
      const sym = normaliseSymbol(newSymbol);
      onAddSymbol(watchlist.id, sym, newSymbolName.trim() || sym);
      setNewSymbol('');
      setNewSymbolName('');
    }
  };

  const handleAddWatchlist = (e) => {
    e.preventDefault();
    if (newWatchlistName.trim()) {
      onAddWatchlist(newWatchlistName.trim());
      setNewWatchlistName('');
      setShowNewWatchlistInput(false);
    }
  };

  const handleRename = (id) => {
    if (editName.trim()) {
      onRenameWatchlist(id, editName.trim());
      setEditingWatchlistId(null);
      setEditName('');
    }
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (file) {
      onImport(file);
      e.target.value = '';
    }
  };

  // Extract just the ticker part for display (e.g. "NASDAQ:AAPL" → "AAPL")
  const displayTicker = (symbol) => symbol.includes(':') ? symbol.split(':')[1] : symbol;

  return (
    <div className="bg-primary rounded-lg overflow-hidden h-full flex flex-col">

      {/* ── Header: title + action buttons ── */}
      <div className="p-4 border-b border-accent">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold">Watchlists</h2>
          <div className="flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 hover:bg-secondary rounded transition-colors"
              title="Import CSV"
            >
              <Upload size={18} />
            </button>
            <button
              onClick={() => watchlist && onExport(watchlist.id)}
              className="p-2 hover:bg-secondary rounded transition-colors"
              title="Export CSV"
              disabled={!watchlist}
            >
              <Download size={18} />
            </button>
            <button
              onClick={() => setShowNewWatchlistInput(true)}
              className="p-2 hover:bg-secondary rounded transition-colors"
              title="New Watchlist"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImport}
          accept=".csv"
          className="hidden"
        />

        {/* New watchlist name input */}
        {showNewWatchlistInput && (
          <form onSubmit={handleAddWatchlist} className="mb-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={newWatchlistName}
                onChange={(e) => setNewWatchlistName(e.target.value)}
                placeholder="Watchlist name"
                className="flex-1 bg-secondary border border-accent rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent text-sm"
                autoFocus
              />
              <button type="submit" className="p-2 bg-success text-white rounded">
                <Check size={18} />
              </button>
              <button
                type="button"
                onClick={() => { setShowNewWatchlistInput(false); setNewWatchlistName(''); }}
                className="p-2 bg-danger text-white rounded"
              >
                <X size={18} />
              </button>
            </div>
          </form>
        )}

        {/* Watchlist tabs */}
        <div className="flex gap-2 flex-wrap">
          {watchlists.map(wl => (
            <div key={wl.id} className="flex items-center gap-1">
              {editingWatchlistId === wl.id ? (
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="bg-secondary border border-accent rounded px-2 py-1 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-accent"
                    autoFocus
                  />
                  <button onClick={() => handleRename(wl.id)} className="p-1 bg-success text-white rounded">
                    <Check size={14} />
                  </button>
                  <button
                    onClick={() => { setEditingWatchlistId(null); setEditName(''); }}
                    className="p-1 bg-danger text-white rounded"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => onWatchlistChange(wl.id)}
                    className={`px-3 py-1.5 rounded text-sm transition-colors ${
                      activeWatchlistId === wl.id
                        ? 'bg-accent text-white'
                        : 'bg-secondary hover:bg-accent hover:bg-opacity-50'
                    }`}
                  >
                    {wl.name}
                  </button>
                  <button
                    onClick={() => { setEditingWatchlistId(wl.id); setEditName(wl.name); }}
                    className="p-1 hover:bg-secondary rounded"
                  >
                    <Edit2 size={14} />
                  </button>
                  {watchlists.length > 1 && (
                    <button
                      onClick={() => onRemoveWatchlist(wl.id)}
                      className="p-1 hover:bg-danger hover:bg-opacity-20 rounded"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Add symbol form ── */}
      <div className="p-4 border-b border-accent space-y-2">
        <form onSubmit={handleAddSymbol} className="flex gap-2">
          <input
            type="text"
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
            placeholder="Symbol (e.g. NASDAQ:AAPL or AAPL)"
            className="flex-1 bg-secondary border border-accent rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent text-sm"
          />
          <input
            type="text"
            value={newSymbolName}
            onChange={(e) => setNewSymbolName(e.target.value)}
            placeholder="Label (optional)"
            className="w-36 bg-secondary border border-accent rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent text-sm"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-accent hover:bg-opacity-80 rounded transition-colors flex items-center gap-2 text-sm"
          >
            <Plus size={16} />
            Add
          </button>
        </form>

        {/* Symbol chips — click to load chart, × to remove */}
        {watchlist?.symbols.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {watchlist.symbols.map(stock => (
              <div
                key={stock.symbol}
                className="flex items-center gap-1 bg-secondary rounded-full px-3 py-1 text-sm"
              >
                <button
                  onClick={() => onSymbolClick && onSymbolClick(stock.symbol)}
                  className="font-semibold hover:text-success transition-colors"
                  title={`Load chart for ${stock.symbol}`}
                >
                  {displayTicker(stock.symbol)}
                </button>
                <button
                  onClick={() => onRemoveSymbol(watchlist.id, stock.symbol)}
                  className="text-gray-500 hover:text-danger transition-colors ml-1"
                  title="Remove"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── TradingView Market Overview (real data) ── */}
      <div className="flex-1 overflow-hidden">
        {!watchlist?.symbols.length ? (
          <div className="p-6 text-center text-gray-400">
            No symbols yet. Add some above to see live prices.
          </div>
        ) : (
          <TradingViewMarketOverview
            symbols={watchlist.symbols}
            listName={watchlist.name}
          />
        )}
      </div>
    </div>
  );
};

export default Watchlist;
