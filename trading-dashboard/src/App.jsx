import { useState } from 'react';
import ThemeFinder from './components/ThemeFinder';
import { TrendingUp } from 'lucide-react';

function App() {
  const [mode, setMode] = useState('themes'); // 'themes' | 'sectors'

  return (
    <div className="min-h-screen bg-[#0a0e27] text-white">
      {/* Header */}
      <header className="bg-primary border-b border-accent p-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="text-success" />
          {mode === 'sectors' ? 'Sector Finder' : 'Theme Finder'}
        </h1>

        {/* Themes / Sectors pill toggle */}
        <button
          onClick={() => setMode((m) => (m === 'themes' ? 'sectors' : 'themes'))}
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
