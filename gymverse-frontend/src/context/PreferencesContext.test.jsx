// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CURRENCIES, PreferencesProvider, usePreferences } from './PreferencesContext';
import { CurrencySelector, ThemeToggle } from '../components/ui/PreferencesControls';
import PlanForm from '../components/forms/PlanForm';

function Probe() {
  const { money, displayCurrency } = usePreferences();
  return <><ThemeToggle /><CurrencySelector /><output>{money(10)} / {displayCurrency}</output></>;
}
const rates = () => CURRENCIES.filter(([code]) => code !== 'USD').map(([code]) => ({ base: 'USD', quote: code, rate: code === 'JPY' ? 150 : 2, date: '2026-10-09' }));
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => rates() }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test('toggles themes and restores the choice after remounting', async () => {
  const view = render(<PreferencesProvider><Probe /></PreferencesProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }));
  expect(document.documentElement.dataset.theme).toBe('light');
  expect(localStorage.getItem('gymverse-theme')).toBe('light');
  view.unmount();
  render(<PreferencesProvider><Probe /></PreferencesProvider>);
  expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
  expect(document.documentElement.dataset.theme).toBe('dark');
  await waitFor(() => expect(fetch).toHaveBeenCalled());
});

test('currency dropdown converts amounts and persists the selected currency', async () => {
  render(<PreferencesProvider><Probe /></PreferencesProvider>);
  fireEvent.click(screen.getByRole('combobox', { name: 'Display currency' }));
  fireEvent.click(screen.getByRole('option', { name: 'INR — Indian Rupee' }));
  await screen.findByText('₹20.00 / INR');
  expect(localStorage.getItem('gymverse-currency')).toBe('INR');
  expect(screen.getByText(/rates as of 2026-10-09/)).toBeTruthy();
});

test('rounds yen using its currency precision and restores saved currency', async () => {
  localStorage.setItem('gymverse-currency', 'JPY');
  render(<PreferencesProvider><Probe /></PreferencesProvider>);
  expect(await screen.findByText('¥1,500 / JPY')).toBeTruthy();
});

test('failed rates retain USD labels and retry recovers the requested conversion', async () => {
  localStorage.setItem('gymverse-currency', 'EUR');
  fetch.mockRejectedValueOnce(new Error('offline'));
  render(<PreferencesProvider><Probe /></PreferencesProvider>);
  await screen.findByText(/Rates unavailable; showing USD/);
  expect(screen.getByText('$10.00 / USD')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('€20.00 / EUR')).toBeTruthy();
});

test('incomplete rates cannot label USD amounts as foreign currency', async () => {
  localStorage.setItem('gymverse-currency', 'INR');
  fetch.mockResolvedValueOnce({ ok: true, json: async () => rates().filter(row => row.quote !== 'INR') });
  render(<PreferencesProvider><Probe /></PreferencesProvider>);
  await screen.findByText(/Rates unavailable; showing USD/);
  expect(screen.getByText('$10.00 / USD')).toBeTruthy();
});

test('editing an existing plan displays conversion and submits its original USD price', async () => {
  localStorage.setItem('gymverse-currency', 'INR');
  const submit = vi.fn();
  render(<PreferencesProvider><PlanForm initialData={{ plan_name: 'Starter', price: 10, duration_months: 1, access_level: 'basic', status: 'active' }} onSubmit={submit} /></PreferencesProvider>);
  await screen.findByText(/Preview: ₹20.00 INR/);
  fireEvent.click(screen.getByRole('button', { name: 'Update plan' }));
  expect(submit.mock.calls[0][0].price).toBe(10);
});
