// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import ChatWidget from './ChatWidget';
const mocks = vi.hoisted(() => ({ auth: {}, get: vi.fn(), post: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('../services/api', () => ({ default: { get: mocks.get, post: mocks.post }, getErrorMessage: () => 'Error loading history' }));
beforeEach(() => {
  mocks.auth = { isAuthenticated: true, user: { user_id: 1 }, token: 'first' };
  mocks.get.mockReset(); mocks.post.mockReset();
  mocks.get.mockResolvedValue({ data: { available: false, conversations: [] } });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);
const open = () => fireEvent.click(screen.getByRole('button', { name: 'Open chat' }));
const send = text => {
  fireEvent.change(screen.getByLabelText('Message GymVerse Assistant'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
};
test('offline replies remain temporary, and a remount loses them', async () => {
  mocks.post.mockResolvedValue({ data: { success: true, response: 'Temporary answer', persistence: { saved: false, available: false } } });
  const view = render(<ChatWidget />); open(); send('Private question');
  await screen.findByText('Temporary answer');
  expect(screen.getByText('Temporary chat — history isn’t being saved')).toBeTruthy();
  view.unmount(); render(<ChatWidget />); open();
  expect(screen.queryByText('Private question')).toBeNull();
});
test('account switch aborts in-flight requests and ignores their late responses', async () => {
  let resolve;
  mocks.post.mockImplementation(() => new Promise(done => { resolve = done; }));
  const view = render(<ChatWidget />); open(); send('Old account secret');
  const signal = mocks.post.mock.calls[0][2].signal;
  mocks.auth = { isAuthenticated: true, user: { user_id: 2 }, token: 'second' };
  view.rerender(<ChatWidget />); open();
  expect(signal.aborted).toBe(true);
  await act(async () => resolve({ data: { success: true, response: 'Old response', persistence: { saved: true } } }));
  expect(screen.queryByText('Old account secret')).toBeNull();
  expect(screen.queryByText('Old response')).toBeNull();
  mocks.auth = { isAuthenticated: false, user: null, token: null }; view.rerender(<ChatWidget />);
  expect(screen.queryByRole('button', { name: 'Open chat' })).toBeNull();
});
test('saved history loads and a failed load preserves the current conversation', async () => {
  mocks.get.mockResolvedValueOnce({ data: { available: true, conversations: [{ id: 'saved', title: 'Saved chat' }] } })
    .mockResolvedValueOnce({ data: { available: true, messages: [{ role: 'model', content: 'Saved answer' }], nextCursor: null } })
    .mockResolvedValueOnce({ data: { available: false, messages: [] } });
  render(<ChatWidget />); open();
  const picker = screen.getByRole('button', { name: 'Saved conversations' });
  await waitFor(() => expect(picker.disabled).toBe(false));
  fireEvent.click(picker);
  fireEvent.click(await screen.findByRole('option', { name: /Saved chat/ }));
  await screen.findByText('Saved answer');
  expect(screen.queryByRole('listbox')).toBeNull();
  await waitFor(() => expect(picker.disabled).toBe(false));
  fireEvent.click(picker);
  fireEvent.click(await screen.findByRole('option', { name: /Saved chat/ }));
  await screen.findByText('Saved history is temporarily unavailable. Your current chat is still here.');
  expect(screen.getByText('Saved answer')).toBeTruthy();
});
test('saved-conversation picker is keyboard operable and closes on Escape', async () => {
  mocks.get.mockResolvedValueOnce({ data: { available: true, conversations: [{ id: 'a', title: 'First chat' }, { id: 'b', title: 'Second chat' }] } })
    .mockResolvedValueOnce({ data: { available: true, messages: [{ role: 'model', content: 'Second answer' }], nextCursor: null } });
  render(<ChatWidget />); open();
  const picker = screen.getByRole('button', { name: 'Saved conversations' });
  await waitFor(() => expect(picker.disabled).toBe(false));
  fireEvent.keyDown(picker, { key: 'ArrowDown' });
  const list = screen.getByRole('listbox', { name: 'Saved conversations' });
  expect(document.activeElement).toBe(list);
  expect(list.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: /First chat/ }).id);
  fireEvent.keyDown(list, { key: 'ArrowDown' });
  expect(list.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: /Second chat/ }).id);
  fireEvent.keyDown(list, { key: 'Escape' });
  expect(screen.queryByRole('listbox')).toBeNull();
  expect(document.activeElement).toBe(picker);
  fireEvent.keyDown(picker, { key: 'ArrowUp' });
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Enter' });
  await screen.findByText('Second answer');
  expect(mocks.get).toHaveBeenCalledWith('/chat/conversations/b', expect.anything());
  expect(screen.queryByRole('listbox')).toBeNull();
});
test('reconnection sends only the new exchange for saving and marks the earlier gap', async () => {
  mocks.post.mockResolvedValueOnce({ data: { success: true, response: 'Offline reply', persistence: { saved: false, available: false } } })
    .mockResolvedValueOnce({ data: { success: true, response: 'Online reply', persistence: { saved: true, available: true } } });
  render(<ChatWidget />); open(); send('Offline question'); await screen.findByText('Offline reply');
  send('New question'); await screen.findByText('Online reply');
  expect(mocks.post.mock.calls[1][1]).toMatchObject({ message: 'New question', gapBefore: true });
  expect(screen.getByText('Temporary messages in this chat won’t appear in saved history.')).toBeTruthy();
});
test('the greeting and local error notes are never sent to the model, and the server explains failures', async () => {
  mocks.post
    .mockRejectedValueOnce({ response: { status: 503, data: { message: 'The assistant is temporarily unavailable. Please try again shortly.' } } })
    .mockResolvedValueOnce({ data: { success: true, response: 'Real reply', persistence: { saved: false, available: false } } });
  render(<ChatWidget />); open(); send('First question');
  await screen.findByText('The assistant is temporarily unavailable. Please try again shortly.');
  await waitFor(() => expect(screen.getByLabelText('Message GymVerse Assistant').disabled).toBe(false));
  send('Second question'); await screen.findByText('Real reply');
  expect(mocks.post.mock.calls[0][1].conversationHistory).toEqual([]);
  expect(mocks.post.mock.calls[1][1].conversationHistory).toEqual([{ role: 'user', content: 'First question' }]);
});
test('temporary chat is flagged to the server, kept out of saved history, and discarded on switching back', async () => {
  mocks.get.mockResolvedValue({ data: { available: true, conversations: [] } });
  mocks.post.mockResolvedValueOnce({ data: { success: true, response: 'Saved reply', persistence: { saved: true, available: true } } })
    .mockResolvedValueOnce({ data: { success: true, response: 'Private reply', persistence: { saved: false, temporary: true, available: true } } });
  render(<ChatWidget />); open();
  await screen.findByText('History connected — new messages will be saved');
  send('Saved question'); await screen.findByText('Saved reply');

  const toggle = screen.getByRole('button', { name: 'Temporary chat' });
  expect(toggle.getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByText('Temporary chat — this conversation won’t be saved')).toBeTruthy();
  expect(screen.queryByText('Saved question')).toBeNull();

  send('Private question'); await screen.findByText('Private reply');
  const [savedCall, privateCall] = mocks.post.mock.calls.map(call => call[1]);
  expect(savedCall.temporary).toBe(false);
  expect(privateCall).toMatchObject({ message: 'Private question', temporary: true });
  expect(privateCall.conversationId).not.toBe(savedCall.conversationId);

  fireEvent.click(screen.getByRole('button', { name: 'Saved conversations' }));
  expect(screen.getByRole('option', { name: /Saved question/ })).toBeTruthy();
  expect(screen.queryByRole('option', { name: /Private question/ })).toBeNull();
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });

  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-pressed')).toBe('false');
  expect(screen.queryByText('Private question')).toBeNull();
  expect(screen.queryByText('Private reply')).toBeNull();
});
