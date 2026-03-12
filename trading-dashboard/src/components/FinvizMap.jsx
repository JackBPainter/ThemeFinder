import { useState } from 'react';

const FinvizMap = () => {
  const [mapType, setMapType] = useState('sec');
  const [timeframe, setTimeframe] = useState('');

  const mapTypes = [
    { value: 'sec', label: 'S&P 500' },
    { value: 'sec_all', label: 'All Sectors' },
    { value: 'etf', label: 'ETFs' },
    { value: 'world', label: 'World' }
  ];

  const timeframes = [
    { value: '', label: 'Intraday' },
    { value: 'w1', label: '1 Week' },
    { value: 'w4', label: '1 Month' },
    { value: 'w13', label: '3 Months' },
    { value: 'w26', label: '6 Months' },
    { value: 'w52', label: '1 Year' }
  ];

  const getMapUrl = () => {
    const baseUrl = 'https://finviz.com/map.ashx';
    const params = new URLSearchParams({
      t: mapType,
      st: timeframe
    });
    return `${baseUrl}?${params.toString()}`;
  };

  return (
    <div className="bg-primary rounded-lg overflow-hidden h-full flex flex-col">
      <div className="p-4 border-b border-accent flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold">Market Map</h2>
        <div className="flex gap-2 flex-wrap">
          <select
            value={mapType}
            onChange={(e) => setMapType(e.target.value)}
            className="bg-secondary border border-accent rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          >
            {mapTypes.map(type => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            className="bg-secondary border border-accent rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          >
            {timeframes.map(tf => (
              <option key={tf.value} value={tf.value}>
                {tf.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-white">
        <iframe
          src={getMapUrl()}
          className="w-full h-full border-0"
          title="Finviz Market Map"
          loading="lazy"
        />
      </div>
    </div>
  );
};

export default FinvizMap;
