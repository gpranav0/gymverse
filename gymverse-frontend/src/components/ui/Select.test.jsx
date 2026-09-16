// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import Select from './Select';
import Modal from './Modal';

beforeEach(() => { Element.prototype.scrollIntoView = vi.fn(); });
afterEach(cleanup);

function Controlled({ onChange = () => {}, initial = '', ...props }) {
  const [value, setValue] = useState(initial);
  return (
    <Select
      name="trainer_id"
      aria-label="Trainer"
      value={value}
      onChange={(e) => { onChange(e); setValue(e.target.value); }}
      {...props}
    >
      <option value="" disabled>-- Select a trainer --</option>
      {[{ id: 1, name: 'Arjun' }, { id: 2, name: 'Bhavna' }, { id: 3, name: 'Bharat' }].map((t) => (
        <option key={t.id} value={t.id}>{t.name}</option>
      ))}
    </Select>
  );
}

const trigger = () => screen.getByRole('combobox', { name: 'Trainer' });

test('mouse: opens a themed list in a portal and reports the choice like a native select', () => {
  const onChange = vi.fn();
  render(<Controlled onChange={onChange} />);
  expect(trigger().textContent).toContain('-- Select a trainer --');

  fireEvent.click(trigger());
  const list = screen.getByRole('listbox');
  expect(list.parentElement).toBe(document.body);
  expect(screen.getAllByRole('option')).toHaveLength(4);

  fireEvent.click(screen.getByRole('option', { name: 'Bhavna' }));
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange.mock.calls[0][0].target).toMatchObject({ name: 'trainer_id', value: '2' });
  expect(screen.queryByRole('listbox')).toBeNull();
  expect(trigger().getAttribute('aria-expanded')).toBe('false');
});

test('disabled placeholder options cannot be chosen', () => {
  const onChange = vi.fn();
  render(<Controlled onChange={onChange} />);
  fireEvent.click(trigger());
  fireEvent.click(screen.getByRole('option', { name: '-- Select a trainer --' }));
  expect(onChange).not.toHaveBeenCalled();
});

test('keyboard: arrows skip disabled options, Enter selects, and the chosen option is marked', () => {
  const onChange = vi.fn();
  render(<Controlled onChange={onChange} initial="1" />);
  fireEvent.keyDown(trigger(), { key: 'ArrowDown' });
  const list = screen.getByRole('listbox');
  expect(list.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Arjun' }).id);

  fireEvent.keyDown(list, { key: 'ArrowUp' });   // the placeholder above is disabled
  expect(list.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Arjun' }).id);
  fireEvent.keyDown(list, { key: 'End' });
  fireEvent.keyDown(list, { key: 'Enter' });
  expect(onChange.mock.calls[0][0].target.value).toBe('3');

  fireEvent.click(trigger());
  expect(screen.getByRole('option', { name: 'Bharat' }).getAttribute('aria-selected')).toBe('true');
});

test('typing jumps to matching options, cycling on a repeated letter', () => {
  const onChange = vi.fn();
  render(<Controlled onChange={onChange} />);
  fireEvent.keyDown(trigger(), { key: 'b' });
  expect(onChange.mock.lastCall[0].target.value).toBe('2');
  fireEvent.keyDown(trigger(), { key: 'b' });
  expect(onChange.mock.lastCall[0].target.value).toBe('3');
});

test('Escape closes the list but leaves the surrounding modal open', () => {
  const onClose = vi.fn();
  render(<Modal isOpen onClose={onClose} title="Assign"><Controlled /></Modal>);
  fireEvent.click(trigger());
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
  expect(screen.queryByRole('listbox')).toBeNull();
  expect(onClose).not.toHaveBeenCalled();

  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('required: an empty choice fails form validation with a themed error that clears on selection', () => {
  render(<form><Controlled required /></form>);
  const form = document.querySelector('form');
  let valid;
  act(() => { valid = form.checkValidity(); });
  expect(valid).toBe(false);
  expect(screen.getByRole('alert').textContent).toBe('Please choose an option.');
  expect(trigger().getAttribute('aria-invalid')).toBe('true');

  fireEvent.click(trigger());
  fireEvent.click(screen.getByRole('option', { name: 'Arjun' }));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(form.checkValidity()).toBe(true);
  expect(new FormData(form).get('trainer_id')).toBe('1');
});

test('clicking outside closes the list without changing the value', () => {
  const onChange = vi.fn();
  render(<Controlled onChange={onChange} />);
  fireEvent.click(trigger());
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole('listbox')).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
});
