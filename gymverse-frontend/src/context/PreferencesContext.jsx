import { createContext, useContext, useEffect, useState } from 'react';

export const CURRENCIES = [
  ['USD', 'US Dollar'], ['INR', 'Indian Rupee'], ['EUR', 'Euro'],
  ['GBP', 'British Pound'], ['JPY', 'Japanese Yen'], ['CAD', 'Canadian Dollar'],
  ['AUD', 'Australian Dollar'], ['CHF', 'Swiss Franc'], ['CNY', 'Chinese Yuan'],
];

function readPreference(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}
function savePreference(key, value) {
  try { localStorage.setItem(key, value); } catch { /* Preferences still work without storage. */ }
}
const defaultMoney = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);
const PreferencesContext = createContext({ theme: 'dark', currency: 'USD', displayCurrency: 'USD', money: defaultMoney, convert: Number, rateStatus: 'idle', toggleTheme() {}, setCurrency() {} });

export function PreferencesProvider({ children }) {
  const [theme, setTheme] = useState(() => readPreference('gymverse-theme', 'dark') === 'light' ? 'light' : 'dark');
  const [currency, setCurrency] = useState(() => {
    const saved = readPreference('gymverse-currency', 'USD');
    return CURRENCIES.some(([code]) => code === saved) ? saved : 'USD';
  });
  const [rates, setRates] = useState(null);
  const [rateStatus, setRateStatus] = useState('loading');
  const [rateDate, setRateDate] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    savePreference('gymverse-theme', theme);
  }, [theme]);
  useEffect(() => { savePreference('gymverse-currency', currency); }, [currency]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 10000);
    const apiBase = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
    fetch(`${apiBase}/exchange-rates`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('Exchange rates unavailable'); return response.json(); })
      .then(rows => {
        const next = { USD: 1 };
        for (const row of rows) if (row.base === 'USD' && Number.isFinite(row.rate) && row.rate > 0) next[row.quote] = row.rate;
        if (!CURRENCIES.every(([code]) => next[code])) throw new Error('Incomplete exchange rates');
        if (active) { setRates(next); setRateDate(rows.map(row => row.date).sort()[0]); setRateStatus('ready'); }
      })
      .catch(() => { if (active) { setRates(null); setRateStatus('error'); } })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [attempt]);

  // Never put a foreign currency symbol on an unconverted amount if the service fails.
  const displayCurrency = currency === 'USD' || rates?.[currency] ? currency : 'USD';
  const rate = rates?.[displayCurrency] || 1;
  const convert = value => (Number(value) || 0) * rate;
  const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: displayCurrency }).format(convert(value));
  return <PreferencesContext.Provider value={{ theme, toggleTheme: () => setTheme(current => current === 'dark' ? 'light' : 'dark'), currency, setCurrency, displayCurrency, money, convert, rate, rateDate, rateStatus, retryRates: () => { setRateStatus('loading'); setAttempt(current => current + 1); } }}>{children}</PreferencesContext.Provider>;
}

export const usePreferences = () => useContext(PreferencesContext);
