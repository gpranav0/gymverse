// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Landing from './Landing';

const mocks = vi.hoisted(() => ({ plans: vi.fn(), classes: vi.fn() }));
vi.mock('../../services/membershipService', () => ({ getMembershipPlans: mocks.plans }));
vi.mock('../../services/classService', () => ({ getClassSchedules: mocks.classes }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: false }) }));

beforeEach(() => {
  mocks.plans.mockReset(); mocks.classes.mockReset();
  mocks.plans.mockResolvedValue({ data: [
    { plan_id: 1, plan_name: 'Starter', duration_months: 1, price: 1200, status: 'active' },
    { plan_id: 2, plan_name: 'Commitment', duration_months: 6, price: 6000, status: 'active' },
  ] });
  mocks.classes.mockResolvedValue({ data: [{ schedule_id: 3, class_name: 'Strength Lab', class_date: '2026-10-12', start_time: '08:00', end_time: '09:00', trainer_name: 'Arjun', capacity: 15, enrolled_count: 11 }] });
});
afterEach(cleanup);

test('shows live plans and upcoming sessions, with sign-in path for visitors', async () => {
  render(<MemoryRouter><Landing /></MemoryRouter>);
  expect(await screen.findByText('Starter')).toBeTruthy();
  expect(await screen.findByText('Strength Lab')).toBeTruthy();
  expect(screen.getByText('4 spots left')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Multi-month' }));
  expect(screen.getByText('Commitment')).toBeTruthy();
  expect(screen.queryByText('Starter')).toBeNull();
  expect(screen.getByRole('link', { name: /View Strength Lab class/ }).getAttribute('href')).toBe('/login');
});

test('shows a clear fallback when live services are unavailable', async () => {
  mocks.plans.mockRejectedValue(new Error('Network Error'));
  mocks.classes.mockRejectedValue(new Error('Network Error'));
  render(<MemoryRouter><Landing /></MemoryRouter>);
  expect(await screen.findByText(/Plans could not be loaded/)).toBeTruthy();
  expect(await screen.findByText(/Classes could not be loaded/)).toBeTruthy();
});
