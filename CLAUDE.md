# Trading Dashboard

Real-time financial market analysis app built with React + Vite. Tracks market themes, sectors, individual stocks, and position sizing for traders.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Dev server at http://localhost:3000
npm run build        # Production build to dist/
npm run preview      # Preview production build
```

## Tech Stack

- **React 18** with functional components and hooks
- **Vite 5** (dev server + build, proxies Yahoo Finance / Finviz APIs to avoid CORS)
- **Tailwind CSS 3** (dark trading theme, custom palette in tailwind.config.js)
- **Lucide React** for icons
- **TradingView** widgets loaded via CDN

## Architecture

```
src/
├── components/       # Page-level React components (Home, StockDetail, ThemeFinder, etc.)
├── hooks/            # Custom React hooks (useWatchlists, useVolumeData)
├── services/         # API wrappers (yahooFinanceApi, earningsService, marketRegimeService, watchlistScoringService)
├── utils/            # Shared utilities
├── App.jsx           # Main router (URL query-param based navigation)
├── main.jsx          # Entry point
└── index.css         # Global styles
```

**Navigation** is URL query-param driven (`?view=themes`, `?stock=AAPL`, etc.) with popstate/history integration.

**State**: Component-level useState + localStorage for persistence (watchlists, UI state, account settings). No global state library.

**Data flow**: Components → service functions → proxied external APIs (Yahoo Finance, Finviz, Frankfurter) → parsed/normalized → component state or localStorage.

## Conventions

- Functional components with hooks (useState, useEffect, useCallback, useMemo)
- Async effects use cancellation flags to prevent race conditions
- Console warnings prefixed with service name: `[yahooApi]`, `[pmvol]`, etc.
- 6 standard timeframes: `d1`, `w1`, `w4`, `w13`, `w26`, `w52` (displayed as 1D, 1W, 1M, 3M, 6M, 1Y)
- Helper functions: `fmt()` for number formatting, `perfCls()` / `scoreCls()` / `tierCls()` for Tailwind color classes
- Tailwind responsive grid: `grid-cols-1/2/4` breakpoints

## API Keys

Stored in `.env.local` (not committed):
- `VITE_POLYGON_API_KEY` — Polygon.io
- `VITE_FMP_API_KEY` — Financial Modeling Prep
