import { useState } from 'react';
import { TrendingUp, BarChart3, Layers, Search, ArrowRight, Activity, GitCompareArrows, Zap, Flame, Calculator } from 'lucide-react';

function Home({ onNavigate }) {
  const [search, setSearch] = useState('');

  const handleSearch = (e) => {
    e.preventDefault();
    const ticker = search.trim().toUpperCase();
    if (!ticker) return;
    window.open(`${window.location.pathname}?stock=${ticker}`, '_blank');
    setSearch('');
  };

  const tools = [
    {
      key: 'themes',
      title: 'Theme Finder',
      description: 'Track performance of market themes like AI, Nuclear, Quantum and more across 6 timeframes.',
      icon: Layers,
      color: 'purple',
      gradient: 'from-purple-600/20 to-purple-900/10',
      border: 'border-purple-500/30',
      hover: 'hover:border-purple-500/60',
      iconBg: 'bg-purple-600/20',
      iconColor: 'text-purple-400',
    },
    {
      key: 'sectors',
      title: 'Sector Finder',
      description: 'Analyse sector rotation and find which sectors are leading or lagging the market.',
      icon: BarChart3,
      color: 'blue',
      gradient: 'from-blue-600/20 to-blue-900/10',
      border: 'border-blue-500/30',
      hover: 'hover:border-blue-500/60',
      iconBg: 'bg-blue-600/20',
      iconColor: 'text-blue-400',
    },
    {
      key: 'heatmap',
      title: 'Theme Acceleration Heatmap',
      description: 'Visualise every theme as a tile colour-coded by momentum acceleration, with rank overlaid. Spot accelerating and decelerating themes at a glance.',
      icon: Flame,
      color: 'orange',
      gradient: 'from-orange-600/20 to-orange-900/10',
      border: 'border-orange-500/30',
      hover: 'hover:border-orange-500/60',
      iconBg: 'bg-orange-600/20',
      iconColor: 'text-orange-400',
    },
    {
      key: 'sectorHeatmap',
      title: 'Sector Acceleration Heatmap',
      description: 'Visualise every sector as a tile colour-coded by momentum acceleration, with rank overlaid. Spot rotating and fading sectors at a glance.',
      icon: Flame,
      color: 'amber',
      gradient: 'from-amber-600/20 to-amber-900/10',
      border: 'border-amber-500/30',
      hover: 'hover:border-amber-500/60',
      iconBg: 'bg-amber-600/20',
      iconColor: 'text-amber-400',
    },
    {
      key: 'positionSizer',
      title: 'Position Sizer',
      description: 'Calculate share count, dollar risk, and portfolio exposure from entry price, stop level, and current market regime.',
      icon: Calculator,
      color: 'emerald',
      gradient: 'from-emerald-600/20 to-emerald-900/10',
      border: 'border-emerald-500/30',
      hover: 'hover:border-emerald-500/60',
      iconBg: 'bg-emerald-600/20',
      iconColor: 'text-emerald-400',
    },
  ];

  const tabs = [
    { icon: TrendingUp, label: 'Performance', description: 'Top 20 by average performance across all timeframes' },
    { icon: BarChart3, label: 'Ranking', description: 'Sort by any single timeframe to find current leaders' },
    { icon: Zap, label: 'Momentum', description: 'Weighted momentum scores with acceleration tracking' },
    { icon: GitCompareArrows, label: 'Reversals', description: 'Mean-reversion candidates with diverging short vs long-term performance' },
  ];

  return (
    <div className="min-h-screen bg-[#0a0e27] text-white">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-accent/10 to-transparent pointer-events-none" />
        <div className="max-w-5xl mx-auto px-6 pt-16 pb-12 relative">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-xl bg-success/10 border border-success/20">
              <Activity className="text-success" size={28} />
            </div>
            <h1 className="text-4xl font-bold tracking-tight">Trading Dashboard</h1>
          </div>
          <p className="text-gray-400 text-lg max-w-2xl mb-8">
            Track market themes and sectors across multiple timeframes. Identify momentum, mean-reversion opportunities and relative strength.
          </p>

          {/* Stock Search */}
          <form onSubmit={handleSearch} className="flex items-center gap-2 max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ticker (e.g. AAPL, NVDA)"
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-secondary border border-accent text-sm text-white placeholder-gray-500 focus:outline-none focus:border-gray-500 transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={!search.trim()}
              className="px-4 py-2.5 rounded-lg bg-accent text-sm font-medium text-white hover:bg-accent/80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Go
            </button>
          </form>
        </div>
      </div>

      {/* Tool Cards */}
      <div className="max-w-5xl mx-auto px-6 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.key}
                onClick={() => onNavigate(tool.key)}
                className={`group text-left bg-gradient-to-br ${tool.gradient} rounded-xl border ${tool.border} ${tool.hover} p-6 transition-all hover:scale-[1.01]`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-2.5 rounded-lg ${tool.iconBg}`}>
                    <Icon className={tool.iconColor} size={22} />
                  </div>
                  <ArrowRight className="text-gray-600 group-hover:text-gray-400 transition-colors" size={18} />
                </div>
                <h2 className="text-xl font-semibold mb-2">{tool.title}</h2>
                <p className="text-sm text-gray-400 leading-relaxed">{tool.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Available Tabs */}
      <div className="max-w-5xl mx-auto px-6 pb-16">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Analysis Views</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <div
                key={tab.label}
                className="bg-secondary/40 rounded-lg border border-accent/50 p-4"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon size={14} className="text-gray-500" />
                  <span className="text-sm font-medium text-gray-300">{tab.label}</span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{tab.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default Home;
