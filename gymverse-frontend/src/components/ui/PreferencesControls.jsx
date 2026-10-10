import { Moon, Sun } from 'lucide-react';
import { CURRENCIES, usePreferences } from '../../context/PreferencesContext';
import Select from './Select';

export function ThemeToggle() {
  const { theme, toggleTheme } = usePreferences();
  const label = `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`;
  return <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label={label} title={label}>
    {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
  </button>;
}

export function CurrencySelector() {
  const { currency, setCurrency, rateStatus, rateDate, retryRates } = usePreferences();
  return <div className="currency-selector">
    <div className="currency-selector-field"><span className="label-caps">Currency</span>
      <Select aria-label="Display currency" value={currency} onChange={event => setCurrency(event.target.value)} className="text-xs">
        {CURRENCIES.map(([code, name]) => <option value={code} key={code}>{code} — {name}</option>)}
      </Select>
    </div>
    {currency !== 'USD' && <small role="status" className="text-ink-muted">{rateStatus === 'loading' ? 'Loading rates; showing USD…' : rateStatus === 'error' ? <>Rates unavailable; showing USD. <button type="button" onClick={retryRates}>Retry</button></> : `USD conversion · rates as of ${rateDate}`}</small>}
  </div>;
}
