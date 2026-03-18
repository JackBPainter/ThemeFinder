const FINVIZ_BASE = '/api/finviz';

/**
 * Fetch SPY data from the Finviz homepage js-indices JSON (^GSPC / S&P 500).
 * Also fetches VIX from the futures page tiles JSON.
 * Returns { spy: { price, change, changePct }, vix: { price, change, changePct } }
 */
export async function fetchMarketData() {
  const [spy, vix] = await Promise.all([fetchSPY(), fetchVIX()]);
  return { spy, vix };
}

async function fetchSPY() {
  try {
    const res = await fetch(`${FINVIZ_BASE}/`);
    if (!res.ok) return null;
    const html = await res.text();

    // Parse the js-indices JSON embedded in the homepage
    const match = html.match(/<script id="js-indices" type="application\/json">(.*?)<\/script>/s);
    if (!match) return null;

    const data = JSON.parse(match[1]);
    const sp = data['^GSPC'];
    if (!sp) return null;

    const price = sp.lastClose ?? sp.close ?? null;
    const prev = sp.prevClose ?? null;
    if (price == null || prev == null || prev === 0) return null;

    const change = price - prev;
    const changePct = (change / prev) * 100;

    return { price, change, changePct };
  } catch {
    return null;
  }
}

async function fetchVIX() {
  try {
    const res = await fetch(`${FINVIZ_BASE}/futures.ashx`);
    if (!res.ok) return null;
    const html = await res.text();

    // Parse the tiles JSON variable on the futures page
    const match = html.match(/var tiles\s*=\s*({.*?});/s);
    if (!match) return null;

    const tiles = JSON.parse(match[1]);
    const vx = tiles['VX'];
    if (!vx) return null;

    return {
      price: vx.last ?? null,
      change: vx.change ?? null,       // already a percentage
      changePct: vx.change ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Classify the market regime based on SPY trend and VIX level.
 *
 * Regime rules:
 *   Bull:   VIX < 20  AND  SPY change >= 0
 *   Bear:   VIX > 30  OR   SPY change < -1%
 *   Choppy: everything else
 *
 * Risk guidance per regime:
 *   Bull:   1.0% risk/trade, up to 5 positions
 *   Choppy: 0.75% risk/trade, up to 3 positions
 *   Bear:   0.5% risk/trade, up to 1-2 positions
 */
export function classifyRegime(spy, vix) {
  if (!spy || !vix) return null;

  const vixPrice = vix.price;
  const spyPct = spy.changePct;

  let regime, color, riskPct, maxPositions;

  if (vixPrice > 30 || spyPct < -1) {
    regime = 'Bear';
    color = 'danger';
    riskPct = 0.5;
    maxPositions = '1–2';
  } else if (vixPrice < 20 && spyPct >= 0) {
    regime = 'Bull';
    color = 'success';
    riskPct = 1.0;
    maxPositions = '5';
  } else {
    regime = 'Choppy';
    color = 'warning';
    riskPct = 0.75;
    maxPositions = '3';
  }

  return { regime, color, riskPct, maxPositions };
}
