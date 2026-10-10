const QUOTES = ['INR', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY'];
const URL = `https://api.frankfurter.dev/v2/rates?base=USD&quotes=${QUOTES.join(',')}`;
const CACHE_MS = 60 * 60 * 1000;
let cached;
let expiresAt = 0;
let pending;

async function getExchangeRates() {
  if (cached && Date.now() < expiresAt) return cached;
  // Share one upstream request across concurrent visitors.
  if (!pending) {
    pending = (async () => {
      const response = await fetch(URL, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('Exchange rates unavailable');
      const rows = await response.json();
      if (!Array.isArray(rows)) throw new Error('Invalid exchange rates');
      const valid = rows.filter(row => row.base === 'USD' && QUOTES.includes(row.quote)
        && Number.isFinite(row.rate) && row.rate > 0 && /^\d{4}-\d{2}-\d{2}$/.test(row.date));
      if (!QUOTES.every(quote => valid.some(row => row.quote === quote))) throw new Error('Incomplete exchange rates');
      cached = valid.map(({ base, quote, rate, date }) => ({ base, quote, rate, date }));
      expiresAt = Date.now() + CACHE_MS;
      return cached;
    })().finally(() => { pending = null; });
  }
  return pending;
}

module.exports = { getExchangeRates };
