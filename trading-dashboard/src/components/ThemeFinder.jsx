import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { RefreshCw, ChevronDown, ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { getStockPerformance } from '../services/yahooFinanceApi';
import { fetchFinvizSnapshot } from '../services/earningsService';

// key  = internal identifier & React key
// st   = Finviz "st" query param (empty string = intraday/1-day)
// short = abbreviated label used in the stock drill-down sub-table
const TIMEFRAMES = [
  { key: 'd1',  st: '',    label: '1 Day',    short: '1D' },
  { key: 'w1',  st: 'w1',  label: '1 Week',   short: '1W' },
  { key: 'w4',  st: 'w4',  label: '1 Month',  short: '1M' },
  { key: 'w13', st: 'w13', label: '3 Months', short: '3M' },
  { key: 'w26', st: 'w26', label: '6 Months', short: '6M' },
  { key: 'w52', st: 'w52', label: '1 Year',   short: '1Y' },
];

const TABS = [
  { key: 'performance', label: 'Performance'   },
  { key: 'ranking',     label: 'Ranking'       },
  // { key: 'golden',      label: 'Golden Themes' },
  { key: 'momentum',    label: 'Momentum'      },
  { key: 'reversals',   label: 'Reversals'     },
];

// Timeframes used for reversal analysis (1Y → 6M → 3M → 1M, oldest first)
const REVERSAL_TFS = ['w52', 'w26', 'w13', 'w4'];
const REVERSAL_TF_LABELS = { w52: '1Y', w26: '6M', w13: '3M', w4: '1M' };

// Momentum weight presets — higher weight = more influence on the score
const MOMENTUM_PRESETS = [
  {
    key: 'aggressive',
    label: 'Aggressive',
    shortLabel: 'Aggr',
    description: 'Heaviest on 1D/1W — for fast-moving momentum plays',
    weights: { d1: 4, w1: 3, w4: 1, w13: 0, w26: 0, w52: 0 },
  },
  {
    key: 'balanced',
    label: 'Balanced',
    shortLabel: 'Bal',
    description: 'Emphasises 1W/1M with some 3M context',
    weights: { d1: 1, w1: 3, w4: 2, w13: 1, w26: 0, w52: 0 },
  },
  {
    key: 'swing',
    label: 'Swing',
    shortLabel: 'Swing',
    description: 'Core swing window — 1W through 3M, ignores noise and long-term',
    weights: { d1: 0, w1: 3, w4: 2, w13: 1, w26: 0, w52: 0 },
  },
  {
    key: 'meanReversion',
    label: 'Mean Reversion',
    shortLabel: 'MeanRev',
    description: 'Inverted — favours long-term strength, finds laggards recovering',
    weights: { d1: 0, w1: 0, w4: 1, w13: 2, w26: 3, w52: 4 },
  },
];

// Short descriptions for Finviz industry sub-sectors (used in sector mode description column)
const SECTOR_DESCRIPTIONS = {
  // Technology
  'Semiconductors': 'Chip designers and manufacturers',
  'Semiconductor Equipment': 'Equipment used in chip fabrication',
  'Software - Infrastructure': 'Operating systems, cloud, and security software',
  'Software - Application': 'Business and productivity software',
  'Information Technology Services': 'IT consulting and managed services',
  'Electronic Components': 'Passive and active electronic parts',
  'Electronics & Computer Distribution': 'Technology wholesale and distribution',
  'Communication Equipment': 'Networking and telecom hardware',
  'Computer Hardware': 'PCs, servers, and peripherals',
  'Consumer Electronics': 'TVs, phones, and home devices',
  'Scientific & Technical Instruments': 'Measurement and lab instruments',
  'Electronic Gaming & Multimedia': 'Video game hardware and media',
  'Solar': 'Solar panel makers and installers',
  // Healthcare
  'Biotechnology': 'Drug development using biological processes',
  'Drug Manufacturers - General': 'Large-cap pharmaceutical companies',
  'Drug Manufacturers - Specialty & Generic': 'Specialty and generic drug makers',
  'Medical Devices': 'Implants, diagnostics, and surgical tools',
  'Medical Instruments & Supplies': 'Disposable and reusable medical supplies',
  'Diagnostics & Research': 'Lab testing and medical research services',
  'Healthcare Plans': 'Health insurance and managed care',
  'Medical Care Facilities': 'Hospitals, clinics, and care centers',
  'Pharmaceutical Retailers': 'Pharmacy chains and drug stores',
  'Health Information Services': 'Healthcare IT and data services',
  // Financial Services
  'Banks - Diversified': 'Large global banking conglomerates',
  'Banks - Regional': 'Community and regional banks',
  'Insurance - Diversified': 'Multi-line insurance companies',
  'Insurance - Life': 'Life and annuity insurance',
  'Insurance - Property & Casualty': 'Home, auto, and casualty insurance',
  'Insurance - Reinsurance': 'Insurance for insurers',
  'Insurance - Specialty': 'Niche and specialty insurance lines',
  'Insurance Brokers': 'Insurance distribution and brokerage',
  'Asset Management': 'Investment management and fund companies',
  'Capital Markets': 'Investment banks and broker-dealers',
  'Financial Data & Stock Exchanges': 'Market data providers and exchanges',
  'Mortgage Finance': 'Mortgage origination and servicing',
  'Credit Services': 'Consumer and commercial credit providers',
  'Shell Companies': 'Blank-check companies and SPACs',
  // Consumer Cyclical
  'Auto Manufacturers': 'Car and truck makers',
  'Auto Parts': 'Automotive parts and accessories',
  'Auto & Truck Dealerships': 'Vehicle sales and service',
  'Specialty Retail': 'Niche and specialty store chains',
  'Apparel Retail': 'Clothing and fashion retailers',
  'Apparel Manufacturing': 'Clothing designers and manufacturers',
  'Home Improvement Retail': 'Home improvement and hardware stores',
  'Home Furnishings & Fixtures': 'Furniture and home decor',
  'Furnishings, Fixtures & Appliances': 'Furniture, appliances, and home goods',
  'Luxury Goods': 'High-end fashion, jewelry, and accessories',
  'Department Stores': 'Full-line department store chains',
  'Discount Stores': 'Low-price general merchandise retailers',
  'Grocery Stores': 'Supermarkets and food retailers',
  'Restaurants': 'Full-service and fast food restaurants',
  'Lodging': 'Hotels and accommodation services',
  'Resorts & Casinos': 'Gaming, resorts, and hospitality',
  'Gambling': 'Casinos, lotteries, and online gambling',
  'Leisure': 'Recreation and entertainment services',
  'Personal Services': 'Consumer personal care and services',
  'Recreational Vehicles': 'RVs, boats, and powersports',
  'Travel Services': 'Travel booking and tour operators',
  'Internet Retail': 'E-commerce and online marketplaces',
  'Residential Construction': 'Home builders and developers',
  'Textile Manufacturing': 'Fabric and textile production',
  'Packaging & Containers': 'Packaging materials and containers',
  'Rubber & Plastics': 'Rubber and plastic product makers',
  'Footwear & Accessories': 'Shoes, bags, and fashion accessories',
  // Consumer Defensive
  'Beverages - Alcoholic': 'Beer, wine, and spirits producers',
  'Beverages - Brewers': 'Beer and malt beverage makers',
  'Beverages - Non-Alcoholic': 'Soft drinks, water, and juices',
  'Beverages - Wineries & Distilleries': 'Wine and spirits producers',
  'Confectioners': 'Candy, chocolate, and snack makers',
  'Education & Training Services': 'Schools, tutoring, and online learning',
  'Food Distribution': 'Wholesale food distribution',
  'Food Manufacturers': 'Packaged and processed food makers',
  'Household & Personal Products': 'Cleaning and personal care products',
  'Packaged Foods': 'Branded packaged food companies',
  'Tobacco': 'Cigarette and tobacco product makers',
  'Farm Products': 'Agricultural commodity producers',
  // Energy
  'Oil & Gas E&P': 'Oil and gas exploration and production',
  'Oil & Gas Integrated': 'Vertically integrated oil majors',
  'Oil & Gas Midstream': 'Pipelines and storage infrastructure',
  'Oil & Gas Refining & Marketing': 'Refining and fuel distribution',
  'Oil & Gas Equipment & Services': 'Oilfield services and drilling',
  'Thermal Coal': 'Coal mining for power generation',
  'Uranium': 'Uranium mining and nuclear fuel',
  // Basic Materials
  'Aluminum': 'Aluminum smelting and products',
  'Building Materials': 'Cement, aggregates, and construction materials',
  'Chemicals': 'Industrial and commodity chemicals',
  'Copper': 'Copper mining and production',
  'Gold': 'Gold mining and royalty companies',
  'Industrial Metals & Minerals': 'Base metals mining and processing',
  'Other Industrial Metals & Mining': 'Diversified metals and mining',
  'Other Precious Metals & Mining': 'Silver, platinum, and other precious metals',
  'Silver': 'Silver mining and streaming companies',
  'Specialty Chemicals': 'High-value niche chemical products',
  'Steel': 'Steel manufacturing and distribution',
  // Industrials
  'Aerospace & Defense': 'Aircraft, missiles, and defense systems',
  'Agricultural Farm Machinery': 'Tractors and farm equipment',
  'Airlines': 'Passenger and cargo airlines',
  'Airports & Air Services': 'Airport operations and ground services',
  'Building Products & Equipment': 'Construction products and HVAC',
  'Business Equipment & Supplies': 'Office equipment and supplies',
  'Conglomerates': 'Diversified multi-industry companies',
  'Consulting Services': 'Management and business consulting',
  'Electrical Equipment & Parts': 'Industrial electrical components',
  'Engineering & Construction': 'Infrastructure and project engineering',
  'Farm & Construction Equipment': 'Heavy machinery and equipment',
  'Freight & Logistics Services': 'Freight forwarding and logistics',
  'Industrial Distribution': 'Industrial goods distribution',
  'Infrastructure Operations': 'Toll roads, ports, and infrastructure',
  'Integrated Freight & Logistics': 'Full-service freight and supply chain',
  'Metal Fabrication': 'Metal stamping, forging, and fabrication',
  'Pollution & Treatment Controls': 'Environmental and waste treatment',
  'Railroads': 'Rail freight and passenger transport',
  'Rental & Leasing Services': 'Equipment rental and leasing',
  'Security & Protection Services': 'Physical security and monitoring',
  'Specialty Industrial Machinery': 'Niche industrial equipment makers',
  'Staffing & Employment Services': 'Temporary and permanent staffing',
  'Tools & Accessories': 'Hand and power tools',
  'Trucking': 'Long-haul and regional trucking',
  'Waste Management': 'Solid waste collection and disposal',
  // Real Estate
  'Real Estate - General': 'Real estate services and brokers',
  'Real Estate - Diversified': 'Diversified real estate companies',
  'REIT - Diversified': 'Multi-sector real estate investment trusts',
  'REIT - Healthcare Facilities': 'Medical offices and healthcare REITs',
  'REIT - Hotel & Motel': 'Hospitality and hotel REITs',
  'REIT - Industrial': 'Warehouses and industrial property REITs',
  'REIT - Mortgage': 'Mortgage-backed securities REITs',
  'REIT - Office': 'Office building and workspace REITs',
  'REIT - Residential': 'Apartment and single-family home REITs',
  'REIT - Retail': 'Shopping center and mall REITs',
  'REIT - Specialty': 'Data center, cell tower, and specialty REITs',
  // Utilities
  'Utilities - Diversified': 'Multi-utility companies',
  'Utilities - Independent Power Producers': 'Independent power generators',
  'Utilities - Regulated Electric': 'Regulated electric utilities',
  'Utilities - Regulated Gas': 'Regulated natural gas utilities',
  'Utilities - Regulated Water': 'Water and wastewater utilities',
  'Utilities - Renewable': 'Wind, solar, and renewable power',
  // Communication Services
  'Advertising Agencies': 'Marketing and advertising firms',
  'Broadcasting': 'TV and radio broadcasting',
  'Entertainment': 'Film, music, and live entertainment',
  'Internet Content & Information': 'Search, social media, and online content',
  'Publishing': 'Books, magazines, and digital media',
  'Telecom Services': 'Wired and wireless telecommunications',
  'Wireless Telecom Services': 'Mobile and wireless carriers',
};

// mapType: 'themes' | 'sectors'
async function fetchDefinitions(mapType) {
  const t = mapType === 'sectors' ? 'sec' : 'themes';
  const mapRes = await fetch(`/api/finviz/map.ashx?t=${t}`);
  if (!mapRes.ok) throw new Error(`Finviz map page returned ${mapRes.status}`);
  const mapHtml = await mapRes.text();

  const chunkPattern = mapType === 'sectors'
    ? /href="(\/assets\/dist\/map_base_sec[^"]+\.js)"/
    : /href="(\/assets\/dist\/map_base_themes[^"]+\.js)"/;
  const chunkMatch = mapHtml.match(chunkPattern);
  if (!chunkMatch) throw new Error(`Could not locate ${mapType} data chunk in Finviz page`);

  const chunkRes = await fetch(`/api/finviz${chunkMatch[1]}`);
  if (!chunkRes.ok) throw new Error(`Could not load ${mapType} definitions chunk`);
  const js = await chunkRes.text();

  const items = [];

  if (mapType === 'sectors') {
    const nodeRe = /\{name:"([^"]+)",children:\[/g;
    let nm;
    while ((nm = nodeRe.exec(js)) !== null) {
      const name = nm[1];
      const nodeStart = nm.index;

      let depth = 0, end = nodeStart;
      for (let i = nodeStart; i < Math.min(js.length, nodeStart + 400000); i++) {
        if (js[i] === '{') depth++;
        else if (js[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
      }

      const block = js.slice(nodeStart, end + 1);

      if ((block.match(/children:\[/g) || []).length !== 1) continue;

      const tickerRe = /name:"([A-Z][A-Z0-9.]{0,4})",description:/g;
      const tickers = [];
      let tm;
      while ((tm = tickerRe.exec(block)) !== null) tickers.push(tm[1]);

      if (tickers.length > 0) {
        items.push({
          id:          name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
          displayName: name,
          description: SECTOR_DESCRIPTIONS[name] || name,
          tickers,
        });
      }
    }
  } else {
    const PATTERNS = [
      { re: /name:"([a-z][^"]+)",displayName:"([^"]+)",description:"([^"]*)",extra:"([^"]+)"/g, hasDesc: true  },
      { re: /name:"([a-z][^"]+)",displayName:"([^"]+)",extra:"([^"]+)"/g,                       hasDesc: false },
      { re: /name:"([^"]+)",displayName:"([^"]+)",description:"([^"]*)",extra:"([^"]+)"/g,       hasDesc: true  },
      { re: /name:"([^"]+)",displayName:"([^"]+)",extra:"([^"]+)"/g,                             hasDesc: false },
    ];
    for (const { re, hasDesc } of PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(js)) !== null) {
        items.push({
          id:          m[1],
          displayName: m[2],
          description: hasDesc ? m[3] : '',
          tickers:     (hasDesc ? m[4] : m[3]).split(','),
        });
      }
      if (items.length > 0) break;
    }
  }

  if (items.length === 0) throw new Error(`No ${mapType} definitions found in chunk`);
  return items;
}

async function fetchPerfData(st, mapType) {
  const type = mapType === 'sectors' ? 'sec' : 'themes';
  const res = await fetch(`/api/finviz/api/map_perf.ashx?type=${type}&st=${st}`);
  if (!res.ok) throw new Error(`Performance API returned ${res.status} for st=${st}`);
  const data = await res.json();
  return data.nodes || {};
}

function avgPerf(tickers, perfData) {
  const vals = tickers.map((t) => perfData[t]).filter((v) => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function fmt(v) {
  if (v == null) return '-';
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function perfCls(v) {
  if (v == null) return 'text-gray-500';
  if (v > 3) return 'text-green-400 font-semibold';
  if (v > 0) return 'text-green-500';
  if (v < -3) return 'text-red-400 font-semibold';
  return 'text-red-500';
}

// Momentum-weighted composite RS score vs SPY.
// Weights: 1W×3 + 1M×2 + 3M×1, minus SPY's equivalent weighted score.
function computeCompositeRS(ticker, tickerPerf) {
  const spy1w = tickerPerf['w1']?.['SPY'] ?? 0;
  const spy1m = tickerPerf['w4']?.['SPY'] ?? 0;
  const spy3m = tickerPerf['w13']?.['SPY'] ?? 0;
  const p1w = tickerPerf['w1']?.[ticker] ?? 0;
  const p1m = tickerPerf['w4']?.[ticker] ?? 0;
  const p3m = tickerPerf['w13']?.[ticker] ?? 0;
  return (p1w * 3 + p1m * 2 + p3m * 1) - (spy1w * 3 + spy1m * 2 + spy3m * 1);
}

// Inline SVG sparkline — shows rank trend from 1Y → 6M → 3M → 1M
// Lower rank number = better position, so lower y = better (chart reads top = best)
function SparkRank({ rankPoints }) {
  const valid = rankPoints.filter(Boolean);
  if (valid.length < 2) return <span className="text-gray-600 text-xs">—</span>;
  const W = 48, H = 20, n = rankPoints.length;
  const pts = rankPoints.map((rp, i) => {
    if (!rp) return null;
    const x = (i / (n - 1)) * W;
    const y = (rp.rank / rp.total) * H;
    return { x, y };
  });
  const valid2 = pts.filter(Boolean);
  const improving = valid2[valid2.length - 1].y < valid2[0].y;
  const color = improving ? '#22c55e' : '#ef4444';
  const d = valid2.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  return (
    <svg width={W} height={H} className="inline-block align-middle">
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {valid2.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="1.8" fill={color} />)}
    </svg>
  );
}

// Stock-level relative strength drill-down sub-table.
// Primary data: Finviz merged nodes (themes + sectors), already in tickerPerf.
// Fallback: Yahoo Finance via Vite proxy for any tickers absent from both Finviz maps.
function getUSMarketPhase() {
  // Use Intl.DateTimeFormat to reliably get ET hour/minute/day
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric', minute: 'numeric', weekday: 'short',
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date()).map((p) => [p.type, p.value])
  );
  const day = parts.weekday; // "Mon", "Tue", etc.
  const hour = parseInt(parts.hour, 10);
  const minute = parseInt(parts.minute, 10);
  const mins = hour * 60 + minute;
  if (day === 'Sat' || day === 'Sun') return 'closed';
  if (mins >= 240 && mins < 570) return 'premarket'; // 4:00 AM – 9:30 AM ET
  if (mins >= 570 && mins < 960) return 'open';       // 9:30 AM – 4:00 PM ET
  return 'closed';
}

function StockDrillDown({ theme, tickerPerf, sortBy }) {
  const [extraPerf, setExtraPerf] = useState({});
  const [volData, setVolData] = useState({});
  const [localEarnings, setLocalEarnings] = useState({});
  const [fetchingTickers, setFetchingTickers] = useState(new Set());
  const [hoveredTicker, setHoveredTicker] = useState(null);
  const marketPhase = getUSMarketPhase();

  useEffect(() => {
    let cancelled = false;
    setExtraPerf({});
    setVolData({});

    const missing = theme.tickers.filter(
      (ticker) => !TIMEFRAMES.some((tf) => tickerPerf[tf.key]?.[ticker] != null),
    );
    const allTickers = theme.tickers;
    setFetchingTickers(new Set(allTickers));

    (async () => {
      for (const ticker of allTickers) {
        if (cancelled) break;
        // Fetch performance + Finviz snapshot (earnings + market cap) in parallel
        const needsSnapshot = !localEarnings[ticker];
        const [perf, snapshot] = await Promise.all([
          getStockPerformance(ticker),
          needsSnapshot ? fetchFinvizSnapshot(ticker) : Promise.resolve(null),
        ]);
        if (cancelled) break;

        // Store volume + price + market cap for all tickers
        if (perf) {
          setVolData((prev) => ({
            ...prev,
            [ticker]: {
              volume: perf.volume,
              avgVolume: perf.avgVolume,
              relVolume: perf.relVolume,
              price: perf.price,
              marketCap: snapshot?.marketCap ?? prev[ticker]?.marketCap ?? null,
            },
          }));
        } else if (snapshot?.marketCap) {
          setVolData((prev) => ({
            ...prev,
            [ticker]: { ...prev[ticker], marketCap: snapshot.marketCap },
          }));
        }

        // Store earnings
        if (snapshot?.earnings) {
          setLocalEarnings((prev) => ({ ...prev, [ticker]: snapshot.earnings }));
        }

        // Only store perf data for tickers missing from Finviz
        if (missing.includes(ticker)) {
          setExtraPerf((prev) => ({ ...prev, [ticker]: perf ?? {} }));
        }

        setFetchingTickers((prev) => { const s = new Set(prev); s.delete(ticker); return s; });
        await new Promise((r) => setTimeout(r, 200));
      }
    })();

    return () => { cancelled = true; };
  }, [theme.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const getPerfForTicker = (ticker) =>
    Object.fromEntries(
      TIMEFRAMES.map((tf) => [
        tf.key,
        tickerPerf[tf.key]?.[ticker] ?? extraPerf[ticker]?.[tf.key] ?? null,
      ]),
    );

  const mergedForRS = {
    ...tickerPerf,
    w1:  { ...(tickerPerf.w1  ?? {}), ...Object.fromEntries(Object.entries(extraPerf).map(([t, p]) => [t, tickerPerf.w1?.[t]  ?? p?.w1  ?? 0])) },
    w4:  { ...(tickerPerf.w4  ?? {}), ...Object.fromEntries(Object.entries(extraPerf).map(([t, p]) => [t, tickerPerf.w4?.[t]  ?? p?.w4  ?? 0])) },
    w13: { ...(tickerPerf.w13 ?? {}), ...Object.fromEntries(Object.entries(extraPerf).map(([t, p]) => [t, tickerPerf.w13?.[t] ?? p?.w13 ?? 0])) },
  };

  const tickerData = theme.tickers
    .map((ticker) => {
      const perfs = getPerfForTicker(ticker);
      const spyPerf = tickerPerf[sortBy]?.['SPY'] ?? 0;
      const rsVsSpy = perfs[sortBy] != null ? perfs[sortBy] - spyPerf : null;
      const compositeRS = computeCompositeRS(ticker, mergedForRS);
      return { ticker, perfs, rsVsSpy, compositeRS };
    })
    .sort((a, b) => b.compositeRS - a.compositeRS);

  const themeAvg = Object.fromEntries(TIMEFRAMES.map((tf) => [tf.key, theme.perf[tf.key]]));


  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500 border-b border-accent/30">
            <th className="text-left py-1.5 px-2 w-5">#</th>
            <th className="text-left py-1.5 px-2">Ticker</th>
            <th className="text-right py-1.5 px-2">Price</th>
            <th className="text-right py-1.5 px-2">Mkt Cap</th>
            {TIMEFRAMES.map((tf) => (
              <th
                key={tf.key}
                className={`text-right py-1.5 px-2 ${sortBy === tf.key ? 'text-gray-200' : ''}`}
              >
                {tf.short}
              </th>
            ))}
            <th
              className="text-right py-1.5 px-2 whitespace-nowrap cursor-help"
              title={marketPhase === 'open'
                ? 'Regular session volume so far today (9:30 AM – now ET). Excludes pre/after hours.'
                : "Previous session's regular hours volume (9:30 AM – 4:00 PM ET). Excludes pre/after hours."}
            >Vol</th>
            <th
              className="text-right py-1.5 px-2 whitespace-nowrap cursor-help"
              title="Relative Volume — today's volume vs 3-month average daily volume (regular hours only)"
            >RVOL</th>
            <th
              className="text-right py-1.5 px-2 text-blue-400 whitespace-nowrap cursor-help"
              title="Relative Strength vs SPY — stock's performance minus SPY's performance for the selected timeframe"
            >RS/SPY</th>
            <th
              className="text-right py-1.5 px-2 text-purple-400 whitespace-nowrap cursor-help"
              title="Composite Relative Strength — weighted score: (1W × 3 + 1M × 2 + 3M × 1) minus the same for SPY. Higher = stronger momentum vs market."
            >Comp RS</th>
          </tr>
        </thead>
        <tbody>
          {tickerData.map((d, i) => {
            const isLoading = fetchingTickers.has(d.ticker);
            const earn = localEarnings[d.ticker] ?? null;
            return (
              <tr key={d.ticker} className="border-b border-accent/10 hover:bg-accent/10 transition-colors">
                <td className="py-1.5 px-2 text-gray-600 font-mono">{i + 1}</td>
                <td className="py-1.5 px-2">
                  <div className="flex items-center gap-1">
                    <a
                      href={`?stock=${d.ticker}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onMouseEnter={() => setHoveredTicker(d.ticker)}
                      onMouseLeave={() => setHoveredTicker(null)}
                      className={`font-mono font-medium px-1 py-0.5 rounded transition-colors ${
                        hoveredTicker === d.ticker
                          ? 'bg-accent text-white ring-1 ring-accent'
                          : 'text-gray-300 hover:bg-accent/30'
                      }`}
                    >
                      {d.ticker}
                    </a>
                    {earn && (
                      <span
                        className={`text-[10px] font-mono px-1 py-0.5 rounded cursor-help whitespace-nowrap ${
                          earn.daysUntil <= 0
                            ? 'bg-red-900/40 text-red-300 font-semibold'
                            : earn.daysUntil <= 7
                            ? 'bg-red-900/30 text-red-400'
                            : earn.daysUntil <= 14
                            ? 'bg-amber-900/30 text-amber-400'
                            : earn.daysUntil <= 28
                            ? 'bg-yellow-900/30 text-yellow-400'
                            : 'bg-gray-800/40 text-gray-400'
                        }`}
                        title={`Earnings ${earn.daysUntil <= 0 ? 'today/just reported' : `in ${earn.daysUntil} day${earn.daysUntil !== 1 ? 's' : ''}`} (${new Date(earn.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${earn.timing ? ' ' + earn.timing : ''})\nConsider position sizing and stop-loss placement`}
                      >
                        {earn.daysUntil <= 0 ? 'ER today' : `ER ${earn.daysUntil}D`}
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-1.5 px-2 text-right font-mono text-gray-300">
                  {(() => {
                    const p = volData[d.ticker]?.price;
                    if (p == null) return fetchingTickers.has(d.ticker) ? '…' : '-';
                    return `$${p.toFixed(2)}`;
                  })()}
                </td>
                <td className="py-1.5 px-2 text-right font-mono text-gray-400">
                  {(() => {
                    const mc = volData[d.ticker]?.marketCap;
                    if (mc == null) return fetchingTickers.has(d.ticker) ? '…' : '-';
                    if (mc >= 1e12) return `$${(mc / 1e12).toFixed(2)}T`;
                    if (mc >= 1e9) return `$${(mc / 1e9).toFixed(1)}B`;
                    if (mc >= 1e6) return `$${(mc / 1e6).toFixed(0)}M`;
                    return `$${(mc / 1e3).toFixed(0)}K`;
                  })()}
                </td>
                {TIMEFRAMES.map((tf) => (
                  <td key={tf.key} className={`py-1.5 px-2 text-right font-mono ${isLoading && d.perfs[tf.key] == null ? 'text-gray-600' : perfCls(d.perfs[tf.key])}`}>
                    {isLoading && d.perfs[tf.key] == null ? '…' : fmt(d.perfs[tf.key])}
                  </td>
                ))}
                <td className="py-1.5 px-2 text-right font-mono text-gray-400">
                  {(() => {
                    const vd = volData[d.ticker];
                    if (!vd?.volume) return fetchingTickers.has(d.ticker) ? '…' : '-';
                    if (vd.volume >= 1e6) return `${(vd.volume / 1e6).toFixed(1)}M`;
                    if (vd.volume >= 1e3) return `${(vd.volume / 1e3).toFixed(0)}K`;
                    return vd.volume.toLocaleString();
                  })()}
                </td>
                <td className={`py-1.5 px-2 text-right font-mono ${
                  (() => {
                    const rv = volData[d.ticker]?.relVolume;
                    if (rv == null) return 'text-gray-500';
                    if (rv >= 3) return 'text-yellow-400 font-semibold';
                    if (rv >= 2) return 'text-green-400';
                    if (rv >= 1.5) return 'text-green-500';
                    return 'text-gray-500';
                  })()
                }`}>
                  {volData[d.ticker]?.relVolume != null
                    ? `${volData[d.ticker].relVolume.toFixed(1)}x`
                    : fetchingTickers.has(d.ticker) ? '…' : '-'}
                </td>
                <td className={`py-1.5 px-2 text-right font-mono ${
                  isLoading && d.rsVsSpy == null ? 'text-gray-600' :
                  d.rsVsSpy == null ? 'text-gray-500' : d.rsVsSpy >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {isLoading && d.rsVsSpy == null ? '…' : d.rsVsSpy != null ? fmt(d.rsVsSpy) : '-'}
                </td>
                <td className={`py-1.5 px-2 text-right font-mono font-semibold ${
                  perfCls(d.compositeRS)
                }`}>
                  {d.compositeRS >= 0 ? '+' : ''}{d.compositeRS.toFixed(2)}
                </td>
              </tr>
            );
          })}
          <tr className="border-t border-accent/30 bg-accent/5">
            <td className="py-1.5 px-2 text-gray-600 font-mono">—</td>
            <td className="py-1.5 px-2 text-gray-500 italic">avg</td>
            <td></td>
            <td></td>
            {TIMEFRAMES.map((tf) => (
              <td key={tf.key} className="py-1.5 px-2 text-right font-mono text-gray-500 italic">
                {fmt(themeAvg[tf.key])}
              </td>
            ))}
            <td colSpan={4} className="py-1.5 px-2 text-right text-gray-600 italic">theme avg</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// Momentum preset pill selector (shared between Golden and Momentum tabs)
function PresetPills({ active, onChange }) {
  return (
    <div className="flex items-center gap-1">
      {MOMENTUM_PRESETS.map((p) => (
        <button
          key={p.key}
          onClick={() => onChange(p.key)}
          className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
            active === p.key
              ? 'bg-purple-600 text-white'
              : 'bg-secondary text-gray-400 hover:text-white'
          }`}
          title={p.description}
        >
          {p.shortLabel}
        </button>
      ))}
    </div>
  );
}

// Momentum acceleration indicator arrow
function AccelIndicator({ value }) {
  if (value == null) return <span className="text-gray-600">—</span>;
  let Icon, cls, label;
  if (value > 0.05) {
    Icon = TrendingUp; cls = 'text-green-400 font-semibold'; label = 'Momentum accelerating strongly';
  } else if (value > 0.01) {
    Icon = TrendingUp; cls = 'text-green-500'; label = 'Momentum accelerating';
  } else if (value < -0.05) {
    Icon = TrendingDown; cls = 'text-red-400 font-semibold'; label = 'Momentum decelerating sharply';
  } else if (value < -0.01) {
    Icon = TrendingDown; cls = 'text-orange-400'; label = 'Momentum decelerating';
  } else {
    Icon = Minus; cls = 'text-gray-500'; label = 'Momentum steady';
  }
  return (
    <span className={`inline-flex items-center gap-0.5 ${cls}`} title={label}>
      <Icon size={13} />
      <span className="text-[10px] font-mono hidden xl:inline">
        {value > 0 ? '+' : ''}{value.toFixed(2)}
      </span>
    </span>
  );
}

// Shared leading columns (chevron, rank, theme/sector link, description)
function LeadingCells({ rank, theme, expanded = false, onExpand = () => {} }) {
  return (
    <>
      <td className="py-3 pr-3 font-mono text-xs">
        <div className="flex items-center gap-1.5">
          <button
            onClick={onExpand}
            className="text-gray-500 hover:text-success transition-colors flex-shrink-0 leading-none"
            title={expanded ? 'Collapse stocks' : 'Show stocks'}
          >
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          <span className="text-gray-500">{rank}</span>
        </div>
      </td>
      <td className="py-3 pr-4 font-medium">
        <span>{theme.displayName}</span>
      </td>
      <td className="py-3 pr-4 text-gray-400 text-xs hidden md:table-cell">
        {theme.description}
      </td>
    </>
  );
}

const ThemeFinder = ({ mode = 'themes' }) => {
  const noun = mode === 'sectors' ? 'sector' : 'theme';
  const Noun = mode === 'sectors' ? 'Sector' : 'Theme';
  const [themes, setThemes] = useState([]);
  const [tickerPerf, setTickerPerf] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('w1');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [activeTab, setActiveTab] = useState('performance');
  const [hoveredTicker, setHoveredTicker] = useState(null);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [expandedThemeId, setExpandedThemeId] = useState(null);
  const [momentumPreset, setMomentumPreset] = useState('swing');
  const [goldenSortBy, setGoldenSortBy] = useState('avgRank');
  const [momentumSortBy, setMomentumSortBy] = useState('rank'); // 'rank' | 'accel' | 'perf'

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setThemes([]);
    setTickerPerf({});
    setExpandedThemeId(null);
    try {
      // Fetch both map types in parallel — themes + sectors cover different stock universes.
      // Primary mode (current view) takes priority on overlap; the other fills gaps.
      const otherMode = mode === 'themes' ? 'sectors' : 'themes';
      const [defs, ...allPerf] = await Promise.all([
        fetchDefinitions(mode),
        ...TIMEFRAMES.map((tf) => fetchPerfData(tf.st, mode)),
        ...TIMEFRAMES.map((tf) => fetchPerfData(tf.st, otherMode)),
      ]);

      const primaryPerf = allPerf.slice(0, TIMEFRAMES.length);
      const secondaryPerf = allPerf.slice(TIMEFRAMES.length);

      // Merge: secondary fills any gaps, primary overwrites where both have data
      const perfByKey = Object.fromEntries(
        TIMEFRAMES.map((tf, i) => [tf.key, { ...secondaryPerf[i], ...primaryPerf[i] }])
      );

      const scored = defs
        .map((t) => ({
          ...t,
          perf: Object.fromEntries(
            TIMEFRAMES.map((tf) => [tf.key, avgPerf(t.tickers, perfByKey[tf.key])])
          ),
        }))
        .filter((t) => TIMEFRAMES.some((tf) => t.perf[tf.key] != null));

      setTickerPerf(perfByKey);
      setThemes(scored);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Collapse any open drill-down when mode (themes/sectors) changes
  useEffect(() => {
    setExpandedThemeId(null);
  }, [mode]);



  const toggleExpand = useCallback((themeId) => {
    setExpandedThemeId((prev) => (prev === themeId ? null : themeId));
  }, []);

  const sortedBy = (key) =>
    [...themes]
      .sort((a, b) => {
        const va = a.perf[key];
        const vb = b.perf[key];
        if (va == null) return 1;
        if (vb == null) return -1;
        return vb - va;
      });

  const perfRows = sortedBy(sortBy).slice(0, 20);
  const rankingRows = sortedBy(sortBy).slice(0, 20);

  const rankByTf = Object.fromEntries(
    TIMEFRAMES.map((tf) => {
      const withPerf = themes.filter((t) => t.perf[tf.key] != null);
      const sorted = [...withPerf].sort((a, b) => b.perf[tf.key] - a.perf[tf.key]);
      const total = sorted.length;
      const map = Object.fromEntries(sorted.map((t, i) => [t.id, { rank: i + 1, total }]));
      return [tf.key, map];
    })
  );

  const maxTrim = TIMEFRAMES.length - 1;
  const safeStart = Math.min(trimStart, maxTrim - trimEnd);
  const safeEnd = Math.min(trimEnd, maxTrim - trimStart);
  const GOLDEN_TIMEFRAMES = TIMEFRAMES.slice(safeStart, TIMEFRAMES.length - safeEnd || undefined);
  // Momentum scoring
  const activePreset = MOMENTUM_PRESETS.find((p) => p.key === momentumPreset) || MOMENTUM_PRESETS[2];

  const momentumData = useMemo(() => {
    const result = {};
    const weights = activePreset.weights;
    // Timeframes with weight > 0, ordered longest → shortest (for accel calc)
    const weightedTfs = TIMEFRAMES.filter((tf) => weights[tf.key] > 0);
    const weightedTfsLongFirst = [...weightedTfs].reverse();

    for (const t of themes) {
      // Rank-based score
      let rankWSum = 0, rankWDiv = 0;
      for (const tf of weightedTfs) {
        const r = rankByTf[tf.key][t.id];
        if (r) { rankWSum += r.rank * weights[tf.key]; rankWDiv += weights[tf.key]; }
      }
      const mtmRankScore = rankWDiv > 0 ? rankWSum / rankWDiv : null;

      // Performance-based score
      let perfWSum = 0, perfWDiv = 0;
      for (const tf of weightedTfs) {
        const p = t.perf[tf.key];
        if (p != null) { perfWSum += p * weights[tf.key]; perfWDiv += weights[tf.key]; }
      }
      const mtmPerfScore = perfWDiv > 0 ? perfWSum / perfWDiv : null;

      // Acceleration — slope of rank from longest to shortest within weighted TFs
      let mtmAccel = null;
      const accelRanks = weightedTfsLongFirst
        .map((tf) => rankByTf[tf.key][t.id]?.rank)
        .filter((v) => v != null);
      if (accelRanks.length >= 2) {
        const total = rankByTf[weightedTfs[0].key][t.id]?.total || themes.length;
        const slope = (accelRanks[0] - accelRanks[accelRanks.length - 1]) / (accelRanks.length - 1);
        mtmAccel = Math.round((slope / total) * 100) / 100;
      }

      result[t.id] = { mtmRankScore, mtmPerfScore, mtmAccel };
    }
    return result;
  }, [themes, rankByTf, activePreset]);

  const momentumRows = useMemo(() =>
    themes
      .map((t) => ({ ...t, ...momentumData[t.id] }))
      .filter((t) => t.mtmRankScore != null)
      .sort((a, b) => {
        if (momentumSortBy === 'accel') return (b.mtmAccel ?? -999) - (a.mtmAccel ?? -999);
        if (momentumSortBy === 'perf') return (b.mtmPerfScore ?? -999) - (a.mtmPerfScore ?? -999);
        return a.mtmRankScore - b.mtmRankScore;
      })
      .slice(0, 20),
    [themes, momentumData, momentumSortBy],
  );

  const goldenRows = themes
    .map((t) => {
      const ranks = GOLDEN_TIMEFRAMES.map((tf) => rankByTf[tf.key][t.id]?.rank).filter((v) => v != null);
      if (ranks.length === 0) return null;
      const avgRank = ranks.reduce((a, b) => a + b, 0) / ranks.length;
      return { ...t, avgRank, rankCount: ranks.length, mtmRankScore: momentumData[t.id]?.mtmRankScore };
    })
    .filter(Boolean)
    .sort((a, b) => goldenSortBy === 'mtmRank'
      ? (a.mtmRankScore ?? 999) - (b.mtmRankScore ?? 999)
      : a.avgRank - b.avgRank)
    .slice(0, 20);

  const reversalData = themes
    .map((t) => {
      const r1m = rankByTf['w4'][t.id];
      const r3m = rankByTf['w13'][t.id];
      const r6m = rankByTf['w26'][t.id];
      const r1y = rankByTf['w52'][t.id];
      if (!r1m || !r1y) return null;
      const divergence = r1y.rank - r1m.rank;
      return { ...t, r1m, r3m, r6m, r1y, divergence };
    })
    .filter(Boolean);

  const overextended = [...reversalData]
    .sort((a, b) => b.divergence - a.divergence)
    .slice(0, 15);

  const bounceCandidates = [...reversalData]
    .sort((a, b) => a.divergence - b.divergence)
    .slice(0, 15);

  // Shared expand row rendered below an expanded theme row
  const ExpandRow = ({ theme, colSpan = 20 }) =>
    expandedThemeId === theme.id && Object.keys(tickerPerf).length > 0 ? (
      <tr>
        <td colSpan={colSpan} className="p-0">
          <div className="bg-secondary/20 border-l-2 border-success px-4 py-3">
            <StockDrillDown
              theme={theme}
              tickerPerf={tickerPerf}
              sortBy={sortBy}

            />
          </div>
        </td>
      </tr>
    ) : null;

  return (
    <div className="bg-primary rounded-lg overflow-hidden h-full flex flex-col">
      {/* Tabs */}
      <div className="flex border-b border-accent px-4">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setExpandedThemeId(null); }}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? 'border-accent text-white'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {tab.key === 'golden' ? `Golden ${Noun}s` : tab.label}
          </button>
        ))}
      </div>

      {/* Header */}
      <div className="py-4 pl-8 pr-4 border-b border-accent flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-sm font-bold flex items-center gap-2">
          {activeTab === 'ranking'
            ? `Top 20 ${noun}s by ${TIMEFRAMES.find(tf => tf.key === sortBy)?.label} · rank shown across all timeframes`
            // : activeTab === 'golden'
            // ? `Top 20 ${noun}s${themes.length ? ` (${themes.length})` : ''} with the best average rank across all timeframes`
            : activeTab === 'momentum'
            ? `Top 20 ${noun}s by momentum · ${activePreset.label} weighting`
            : activeTab === 'reversals'
            ? `Mean-reversion candidates · ranked by divergence between 1M and 1Y performance`
            : `Top 20 performing ${noun}s · avg of constituents`}
        </h2>
        <div className="flex items-center gap-2">
          {(/* activeTab === 'golden' || */ activeTab === 'momentum') && (
            <div className="flex items-center gap-1 mr-2">
              <PresetPills active={momentumPreset} onChange={setMomentumPreset} />
            </div>
          )}
          {activeTab === 'momentum' && (
            <span className="text-[10px] text-gray-500 mr-2">{activePreset.description}</span>
          )}
          {/* Golden timeframe trimmer — commented out with Golden tab
          {activeTab === 'golden' && (
            <div className="flex items-center gap-1 text-xs text-gray-400">
              ...
            </div>
          )}
          */}
          <span className="text-xs text-gray-500">Data is delayed 15 mins</span>
          <button
            onClick={() => fetchData()}
            disabled={loading}
            title="Refresh"
            className="p-1.5 rounded bg-secondary hover:bg-accent transition-colors disabled:opacity-40"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto px-4 pb-4">
        {loading && (
          <div className="flex items-center justify-center h-full gap-2 text-gray-400">
            <RefreshCw size={18} className="animate-spin" />
            Loading {noun} performance data…
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <p className="text-red-400 text-sm max-w-md">{error}</p>
            <div className="flex gap-3">
              <button
                onClick={fetchData}
                className="px-4 py-2 bg-accent rounded text-sm hover:bg-accent/80 transition-colors"
              >
                Retry
              </button>
              <a
                href="https://finviz.com/map.ashx?t=themes"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-secondary rounded text-sm hover:bg-accent/50 transition-colors"
              >
                Open Finviz →
              </a>
            </div>
          </div>
        )}

        {!loading && !error && themes.length > 0 && (
          <>
            {/* Performance tab */}
            {activeTab === 'performance' && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 border-b border-accent sticky top-0 bg-primary z-10">
                    <th className="text-left py-2 pr-3 w-8">#</th>
                    <th className="text-left py-2 pr-4">{Noun}</th>
                    <th className="text-left py-2 pr-4 hidden md:table-cell">Description</th>

                    <th className="text-left py-2 pr-4 hidden lg:table-cell">Trend</th>
                    {TIMEFRAMES.map((tf) => (
                      <th
                        key={tf.key}
                        onClick={() => setSortBy(tf.key)}
                        className={`text-right py-2 px-3 cursor-pointer select-none transition-colors ${
                          sortBy === tf.key ? 'text-white' : 'hover:text-white'
                        }`}
                      >
                        {tf.label} {sortBy === tf.key ? '▼' : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {perfRows.map((theme, i) => (
                    <Fragment key={theme.id}>
                      <tr className={`border-b border-accent/20 hover:bg-secondary/50 transition-colors ${
                        expandedThemeId === theme.id ? 'bg-secondary/40' : ''
                      }`}>
                        <LeadingCells
                          rank={i + 1}
                          theme={theme}
                          expanded={expandedThemeId === theme.id}
                          onExpand={() => toggleExpand(theme.id)}

                        />
                        <td className="py-3 pr-4 hidden lg:table-cell">
                          <SparkRank rankPoints={REVERSAL_TFS.map(key => rankByTf[key][theme.id])} />
                        </td>
                        {TIMEFRAMES.map((tf) => (
                          <td key={tf.key} className={`py-3 px-3 text-right font-mono ${perfCls(theme.perf[tf.key])}`}>
                            {fmt(theme.perf[tf.key])}
                          </td>
                        ))}
                      </tr>
                      <ExpandRow theme={theme} />
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}

            {/* Ranking tab */}
            {activeTab === 'ranking' && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 border-b border-accent sticky top-0 bg-primary z-10">
                    <th className="text-left py-2 pr-3 w-8">#</th>
                    <th className="text-left py-2 pr-4">{Noun}</th>
                    <th className="text-left py-2 pr-4 hidden md:table-cell">Description</th>

                    <th className="text-left py-2 pr-4 hidden lg:table-cell">Trend</th>
                    {TIMEFRAMES.map((tf) => (
                      <th
                        key={tf.key}
                        onClick={() => setSortBy(tf.key)}
                        className={`text-right py-2 px-3 cursor-pointer select-none transition-colors ${sortBy === tf.key ? 'text-white' : 'hover:text-white'}`}
                      >
                        {tf.label} {sortBy === tf.key ? '▼' : ''}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rankingRows.map((theme, i) => (
                    <Fragment key={theme.id}>
                      <tr className={`border-b border-accent/20 hover:bg-secondary/50 transition-colors ${
                        expandedThemeId === theme.id ? 'bg-secondary/40' : ''
                      }`}>
                        <LeadingCells
                          rank={i + 1}
                          theme={theme}
                          expanded={expandedThemeId === theme.id}
                          onExpand={() => toggleExpand(theme.id)}

                        />
                        <td className="py-3 pr-4 hidden lg:table-cell">
                          <SparkRank rankPoints={REVERSAL_TFS.map(key => rankByTf[key][theme.id])} />
                        </td>
                        {TIMEFRAMES.map((tf) => {
                          const r = rankByTf[tf.key][theme.id];
                          return (
                            <td key={tf.key} className="py-3 px-3 text-right font-mono text-xs text-gray-300">
                              {r ? ordinal(r.rank) : '-'}
                            </td>
                          );
                        })}
                      </tr>
                      <ExpandRow theme={theme} />
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}

            {/* Golden tab — commented out
            {activeTab === 'golden' && (
              <table className="w-full text-sm">
                ...
              </table>
            )}
            */}

            {/* Momentum tab */}
            {activeTab === 'momentum' && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 border-b border-accent sticky top-0 bg-primary z-10">
                    <th className="text-left py-2 pr-3 w-8">#</th>
                    <th className="text-left py-2 pr-4">{Noun}</th>
                    <th className="text-left py-2 pr-4 hidden md:table-cell">Description</th>
                    <th className="text-left py-2 pr-4 hidden lg:table-cell">Trend</th>
                    <th
                      className={`text-center py-2 px-2 cursor-pointer transition-colors ${momentumSortBy === 'accel' ? 'text-green-400' : 'text-gray-400 hover:text-green-400'}`}
                      onClick={() => setMomentumSortBy('accel')}
                      title="Momentum acceleration — measures whether rank is improving (↗) or worsening (↘) from longer to shorter timeframes. Positive = accelerating, negative = decelerating."
                    >Accel{momentumSortBy === 'accel' ? ' ▼' : ''}</th>
                    <th
                      className={`text-right py-2 px-3 cursor-pointer transition-colors ${momentumSortBy === 'rank' ? 'text-purple-400' : 'text-gray-400 hover:text-purple-400'}`}
                      onClick={() => setMomentumSortBy('rank')}
                      title="Weighted average rank across the active preset's timeframes. Lower = stronger momentum. Each timeframe's rank is multiplied by its weight before averaging."
                    >Rank{momentumSortBy === 'rank' ? ' ▼' : ''}</th>
                    <th
                      className={`text-right py-2 px-3 cursor-pointer transition-colors ${momentumSortBy === 'perf' ? 'text-white' : 'text-gray-400 hover:text-white'}`}
                      onClick={() => setMomentumSortBy('perf')}
                      title="Weighted average performance (%) across the active preset's timeframes. Shows the actual magnitude of the move — a theme can be ranked 1st with +0.5% or +8%, this column reveals the difference."
                    >Perf{momentumSortBy === 'perf' ? ' ▼' : ''}</th>
                    {TIMEFRAMES.map((tf) => {
                      const w = activePreset.weights[tf.key];
                      return (
                        <th key={tf.key} className={`text-right py-2 px-3 ${w > 0 ? 'text-gray-300' : 'text-gray-600'}`}>
                          {tf.label}
                          {w > 0 && <span className="text-purple-400/60 text-[9px] ml-0.5">{'\u00d7'}{w}</span>}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {momentumRows.map((theme, i) => {
                    const isTop5 = i < 5;
                    const strongAccel = theme.mtmAccel != null && theme.mtmAccel > 0.05;
                    const strongDecel = theme.mtmAccel != null && theme.mtmAccel < -0.05;
                    return (
                      <Fragment key={theme.id}>
                        <tr className={`border-b border-accent/20 hover:bg-secondary/50 transition-colors ${
                          expandedThemeId === theme.id ? 'bg-secondary/40' : ''
                        } ${isTop5 ? 'border-l-2 border-l-purple-500' : ''
                        } ${strongAccel ? 'bg-green-900/10' : strongDecel ? 'bg-red-900/10' : ''}`}>
                          <LeadingCells
                            rank={i + 1}
                            theme={theme}
                            expanded={expandedThemeId === theme.id}
                            onExpand={() => toggleExpand(theme.id)}
                          />
                          <td className="py-3 pr-4 hidden lg:table-cell">
                            <SparkRank rankPoints={REVERSAL_TFS.map(key => rankByTf[key][theme.id])} />
                          </td>
                          <td className="py-3 px-2 text-center">
                            <AccelIndicator value={theme.mtmAccel} />
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-xs text-purple-400 font-semibold">
                            {ordinal(Math.round(theme.mtmRankScore))}
                          </td>
                          <td className={`py-3 px-3 text-right font-mono text-xs ${perfCls(theme.mtmPerfScore)}`}>
                            {theme.mtmPerfScore != null ? fmt(theme.mtmPerfScore) : '-'}
                          </td>
                          {TIMEFRAMES.map((tf) => {
                            const r = rankByTf[tf.key][theme.id];
                            const w = activePreset.weights[tf.key];
                            return (
                              <td key={tf.key} className={`py-3 px-3 text-right font-mono text-xs ${w > 0 ? 'text-gray-300' : 'text-gray-600'}`}>
                                {r ? ordinal(r.rank) : '-'}
                              </td>
                            );
                          })}
                        </tr>
                        <ExpandRow theme={theme} />
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* Reversals tab — two side-by-side panels */}
            {activeTab === 'reversals' && (
              <div className="grid grid-cols-2 gap-4">
                {[
                  {
                    title: 'Overextended',
                    subtitle: 'Strong recently · weak long-term · likely to fade',
                    rows: overextended,
                    scoreLabel: 'Divergence',
                    scoreColor: 'text-orange-400',
                    scoreFn: (t) => `+${t.divergence}`,
                  },
                  {
                    title: 'Bounce Candidates',
                    subtitle: 'Weak recently · strong long-term · likely to recover',
                    rows: bounceCandidates,
                    scoreLabel: 'Divergence',
                    scoreColor: 'text-cyan-400',
                    scoreFn: (t) => `+${Math.abs(t.divergence)}`,
                  },
                ].map(({ title, subtitle, rows, scoreLabel, scoreColor, scoreFn }) => (
                  <div key={title} className="bg-secondary/30 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 border-b border-accent/50">
                      <p className="text-sm font-semibold text-white">{title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-gray-400 border-b border-accent/50 sticky top-0 bg-[#0d1021] z-10">
                          <th className="text-left py-2 px-2 w-6">#</th>
                          <th className="text-left py-2 px-2">{Noun}</th>
                          <th className="text-right py-2 px-2">1Y</th>
                          <th className="text-right py-2 px-2">6M</th>
                          <th className="text-right py-2 px-2">3M</th>
                          <th className="text-right py-2 px-2">1M</th>
                          <th className="text-right py-2 px-2">Trend</th>
                          <th className={`text-right py-2 px-2 ${scoreColor}`}>{scoreLabel}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((theme, i) => {
                          const sparkPoints = [theme.r1y, theme.r6m, theme.r3m, theme.r1m];
                          return (
                            <Fragment key={theme.id}>
                              <tr className={`border-b border-accent/10 hover:bg-secondary/50 transition-colors ${
                                expandedThemeId === theme.id ? 'bg-secondary/40' : ''
                              }`}>
                                <td className="py-2 px-2 text-gray-500 font-mono text-xs">
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => toggleExpand(theme.id)}
                                      className="text-gray-500 hover:text-success transition-colors leading-none"
                                      title={expandedThemeId === theme.id ? 'Collapse stocks' : 'Show stocks'}
                                    >
                                      {expandedThemeId === theme.id
                                        ? <ChevronDown size={12} />
                                        : <ChevronRight size={12} />}
                                    </button>
                                    {i + 1}
                                  </div>
                                </td>
                                <td className="py-2 px-2">
                                  <div>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="text-xs font-medium">{theme.displayName}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-0.5 mt-0.5">
                                      {theme.tickers.slice(0, 6).map((ticker) => (
                                        <a
                                          key={ticker}
                                          href={`?stock=${ticker}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          onMouseEnter={() => setHoveredTicker(ticker)}
                                          onMouseLeave={() => setHoveredTicker(null)}
                                          className={`text-xs font-mono px-1 py-0.5 rounded transition-colors ${
                                            hoveredTicker === ticker
                                              ? 'bg-accent text-white ring-1 ring-accent'
                                              : 'bg-secondary text-gray-400 hover:bg-accent hover:text-white'
                                          }`}
                                        >
                                          {ticker}
                                        </a>
                                      ))}
                                      {theme.tickers.length > 6 && (
                                        <span className="text-xs text-gray-600 px-1 py-0.5">+{theme.tickers.length - 6}</span>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="py-2 px-2 text-right font-mono text-xs text-gray-400">{theme.r1y ? ordinal(theme.r1y.rank) : '-'}</td>
                                <td className="py-2 px-2 text-right font-mono text-xs text-gray-400">{theme.r6m ? ordinal(theme.r6m.rank) : '-'}</td>
                                <td className="py-2 px-2 text-right font-mono text-xs text-gray-400">{theme.r3m ? ordinal(theme.r3m.rank) : '-'}</td>
                                <td className="py-2 px-2 text-right font-mono text-xs text-gray-400">{theme.r1m ? ordinal(theme.r1m.rank) : '-'}</td>
                                <td className="py-2 px-2 text-right"><SparkRank rankPoints={sparkPoints} /></td>
                                <td className={`py-2 px-2 text-right font-mono text-xs font-semibold ${scoreColor}`}>{scoreFn(theme)}</td>
                              </tr>
                              {expandedThemeId === theme.id && Object.keys(tickerPerf).length > 0 && (
                                <tr>
                                  <td colSpan={8} className="p-0">
                                    <div className="bg-secondary/20 border-l-2 border-success px-3 py-2">
                                      <StockDrillDown
                                        theme={theme}
                                        tickerPerf={tickerPerf}
                                        sortBy={sortBy}
                          
                                      />
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}

            {lastUpdated && (
              <p className="text-xs text-gray-500 mt-4">
                <a
                  href={`https://finviz.com/map.ashx?t=${mode === 'sectors' ? 'sec' : 'themes'}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                >
                  Source: Finviz · Updated {lastUpdated.toLocaleTimeString()}
                </a>
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ThemeFinder;
