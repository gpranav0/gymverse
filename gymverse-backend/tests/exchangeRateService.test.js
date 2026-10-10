const quotes = ['INR', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY'];
const rows = () => quotes.map(quote => ({ base: 'USD', quote, rate: 2, date: '2026-10-10' }));
const originalFetch = global.fetch;
beforeEach(() => { jest.resetModules(); global.fetch = jest.fn(); });
afterEach(() => { global.fetch = originalFetch; });

test('fetches fixed USD pairs and caches validated rates', async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => rows() });
  const { getExchangeRates } = require('../src/services/exchangeRateService');
  const results = await Promise.all([getExchangeRates(), getExchangeRates()]);
  expect(results[0]).toEqual(rows());
  expect(results[1]).toEqual(rows());
  expect(await getExchangeRates()).toEqual(rows());
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(global.fetch.mock.calls[0][0]).toContain('https://api.frankfurter.dev/v2/rates?base=USD');
});

test('does not cache an upstream failure and allows retries', async () => {
  global.fetch.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true, json: async () => rows() });
  const { getExchangeRates } = require('../src/services/exchangeRateService');
  await expect(getExchangeRates()).rejects.toThrow('unavailable');
  expect(await getExchangeRates()).toEqual(rows());
});

test('rejects incomplete or invalid rates', async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => rows().map(row => row.quote === 'INR' ? { ...row, rate: -1 } : row) });
  const { getExchangeRates } = require('../src/services/exchangeRateService');
  await expect(getExchangeRates()).rejects.toThrow('Incomplete');
});
