// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import HealthInformation from './HealthInformation';
const mocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('../services/memberService', () => ({ getMemberById: mocks.get, patchMember: mocks.patch }));
vi.mock('../services/api', () => ({ getErrorMessage: () => 'Could not load your health information.' }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

test('loads recorded conditions and saves only the health field for the current member', async () => {
  mocks.get.mockResolvedValue({ data: { health_conditions: 'Asthma' } });
  mocks.patch.mockResolvedValue({ data: { health_conditions: 'Knee injury' } });
  render(<HealthInformation memberId={7} />);
  const input = await screen.findByDisplayValue('Asthma');
  fireEvent.change(input, { target: { value: ' Knee injury ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save health information' }));
  await screen.findByText(/Health information saved/);
  expect(mocks.patch).toHaveBeenCalledWith(7, { health_conditions: 'Knee injury' });
});

test('clearing the optional field sends null', async () => {
  mocks.get.mockResolvedValue({ data: { health_conditions: 'Asthma' } });
  mocks.patch.mockResolvedValue({ data: { health_conditions: null } });
  render(<HealthInformation memberId={7} />);
  fireEvent.change(await screen.findByDisplayValue('Asthma'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save health information' }));
  await screen.findByText(/Health information saved/);
  expect(mocks.patch).toHaveBeenCalledWith(7, { health_conditions: null });
});

test('a failed load cannot overwrite existing records with an empty field', async () => {
  mocks.get.mockRejectedValue(new Error('offline'));
  render(<HealthInformation memberId={7} />);
  await screen.findByText('Could not load your health information.');
  expect(screen.getByLabelText('Health conditions or limitations (optional)').disabled).toBe(true);
  expect(screen.queryByRole('button', { name: 'Save health information' })).toBeNull();
  expect(mocks.patch).not.toHaveBeenCalled();
});
