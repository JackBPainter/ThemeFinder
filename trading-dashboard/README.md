# Trading Dashboard

A modern, real-time trading dashboard built with React, featuring TradingView charts, Finviz market maps, and customizable watchlists.

## Features

### TradingView Integration
- Interactive, professional-grade charts
- Multiple timeframes and technical indicators
- Real-time price data
- Customizable themes and overlays

### Finviz Market Maps
- Visual market overview with heatmaps
- Multiple map types (S&P 500, All Sectors, ETFs, World)
- Different timeframes (Intraday, 1W, 1M, 3M, 6M, 1Y)
- Color-coded performance indicators

### Advanced Watchlists
- **Multiple Watchlists**: Create and manage unlimited watchlists
- **Real-time Prices**: Live price updates every 5 seconds
- **Persistent Storage**: Auto-save to localStorage
- **Import/Export**: CSV import/export for easy backup and sharing
- **Quick Actions**: Add, remove, rename watchlists and symbols
- **Interactive**: Click any symbol to view its chart

## Prerequisites

Before running this project, you need to install [Node.js](https://nodejs.org/) (version 16 or higher).

To check if Node.js is installed:
```bash
node --version
npm --version
```

If not installed, download from [nodejs.org](https://nodejs.org/).

## Installation

1. Navigate to the project directory:
```bash
cd trading-dashboard
```

2. Install dependencies:
```bash
npm install
```

## Running the Application

Start the development server:
```bash
npm run dev
```

The application will open automatically in your browser at `http://localhost:3000`

## Building for Production

Create an optimized production build:
```bash
npm run build
```

Preview the production build:
```bash
npm run preview
```

## Project Structure

```
trading-dashboard/
├── src/
│   ├── components/
│   │   ├── TradingViewChart.jsx    # TradingView chart integration
│   │   ├── FinvizMap.jsx           # Finviz heatmap component
│   │   └── Watchlist.jsx           # Watchlist management UI
│   ├── hooks/
│   │   ├── useWatchlists.js        # Watchlist state management
│   │   └── useStockPrices.js       # Price data fetching
│   ├── App.jsx                     # Main application component
│   ├── main.jsx                    # Application entry point
│   └── index.css                   # Global styles
├── public/                         # Static assets
├── index.html                      # HTML template
├── package.json                    # Dependencies and scripts
├── vite.config.js                  # Vite configuration
├── tailwind.config.js              # Tailwind CSS configuration
└── README.md                       # This file
```

## Usage Guide

### Dashboard View
- View real-time TradingView charts for selected symbols
- Monitor your watchlist with live price updates
- Click any symbol in the watchlist to view its chart

### Market Map View
- Switch to the Market Map view using the navigation
- Select different map types (S&P 500, All Sectors, ETFs, World)
- Choose timeframes to see performance over different periods

### Managing Watchlists
1. **Create a Watchlist**: Click the + button in the watchlist header
2. **Switch Watchlists**: Click on any watchlist tab
3. **Rename Watchlist**: Click the edit icon next to the watchlist name
4. **Delete Watchlist**: Click the trash icon (requires at least 2 watchlists)

### Managing Symbols
1. **Add Symbol**: Enter ticker symbol and optional name, then click Add
2. **Remove Symbol**: Click the trash icon next to any symbol
3. **View Chart**: Click on any symbol row to load its chart

### Import/Export
- **Export**: Click the download icon to export current watchlist as CSV
- **Import**: Click the upload icon and select a CSV file
  - CSV format: `Symbol,Name` (header row required)
  - Example:
    ```csv
    Symbol,Name
    AAPL,Apple Inc.
    MSFT,Microsoft Corp.
    GOOGL,Alphabet Inc.
    ```

## Customization

### Using Real Stock Data

Currently, the app uses mock data for demonstration. To integrate real stock prices:

1. Sign up for a stock market API (recommended providers):
   - [Alpha Vantage](https://www.alphavantage.co/) - Free tier available
   - [Finnhub](https://finnhub.io/) - Free tier available
   - [IEX Cloud](https://iexcloud.io/) - Free tier available

2. Edit [src/hooks/useStockPrices.js](src/hooks/useStockPrices.js) and uncomment the real API integration template

3. Add your API key and configure the fetch logic

### Styling

The dashboard uses a dark theme optimized for trading. Colors can be customized in [tailwind.config.js](tailwind.config.js):

```javascript
colors: {
  primary: '#1a1a2e',      // Main background
  secondary: '#16213e',    // Secondary background
  accent: '#0f3460',       // Accent color
  success: '#00d084',      // Positive changes
  danger: '#ff3d57',       // Negative changes
}
```

## Technologies Used

- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework
- **TradingView Widgets** - Professional charting library
- **Finviz** - Market heatmaps
- **Lucide React** - Icon library
- **localStorage** - Data persistence

## Performance Notes

- Price updates occur every 5 seconds in demo mode
- All watchlists are stored locally in the browser
- Charts are lazy-loaded for optimal performance
- The app is fully responsive and works on mobile devices

## Browser Compatibility

- Chrome (recommended)
- Firefox
- Safari
- Edge

## Troubleshooting

### TradingView charts not loading
- Check your internet connection
- Ensure the TradingView script is loading (check browser console)
- Try a different browser

### Prices not updating
- The demo uses mock data that updates automatically
- For real data, verify your API key and endpoint configuration

### Import not working
- Ensure CSV file has the correct format (Symbol,Name header)
- Check that symbols are valid ticker symbols

## Future Enhancements

Potential features to add:
- News feed integration
- Advanced charting tools
- Portfolio tracking
- Alerts and notifications
- Multiple chart layouts
- Screener functionality
- Options chain data
- Economic calendar

## License

This project is open source and available for personal and commercial use.

## Support

For issues, questions, or suggestions, please create an issue in the project repository.
