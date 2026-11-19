import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pwaMockState } from '../test/pwaRegisterMock';
import { UpdatePrompt } from './UpdatePrompt';

afterEach(() => { pwaMockState.needRefresh = false; pwaMockState.offlineReady = false; vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('UpdatePrompt', () => {
  it('offers an explicit update after a club worker activates without reloading unsaved work', () => {
    vi.stubEnv('VITE_CLUB_APP', 'on');
    const worker = Object.assign(new EventTarget(), { controller: {} });
    vi.stubGlobal('navigator', { serviceWorker: worker });
    render(<UpdatePrompt offlineNotice={false} inline />);
    expect(screen.queryByRole('button', { name: 'Update' })).not.toBeInTheDocument();
    act(() => { worker.dispatchEvent(new Event('controllerchange')); });
    expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument();
  });
  it('a first visit (the worker takes control for the first time) is not an update: no banner', () => {
    vi.stubEnv('VITE_CLUB_APP', 'on');
    const worker = Object.assign(new EventTarget(), { controller: null });
    vi.stubGlobal('navigator', { serviceWorker: worker });
    render(<UpdatePrompt offlineNotice={false} inline />);
    act(() => { worker.dispatchEvent(new Event('controllerchange')); });
    expect(screen.queryByRole('button', { name: 'Update' })).not.toBeInTheDocument();
    act(() => { worker.dispatchEvent(new Event('controllerchange')); });
    expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument();
  });
  it('the personal app still says once that it works offline (unchanged)', () => {
    pwaMockState.offlineReady = true;
    render(<UpdatePrompt />);
    expect(screen.getByText(/now works offline/)).toBeInTheDocument();
  });

  it('the club app shows no "works offline" popup', () => {
    pwaMockState.offlineReady = true;
    const { container } = render(<UpdatePrompt offlineNotice={false} inline />);
    expect(container).toBeEmptyDOMElement();
  });

  it('the club app shows "new version → Update" in the page flow, not floating over forms', () => {
    pwaMockState.needRefresh = true;
    render(<UpdatePrompt offlineNotice={false} inline />);
    const box = screen.getByRole('status');
    expect(box).toHaveClass('toast-inline');
    expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument();
  });
});

import { safeToReload } from './UpdatePrompt';
describe('match-day auto update (audit 19 Nov)', () => {
  const store = (v: string | null) => ({ getItem: () => v });
  afterEach(() => { window.location.hash = ''; document.body.innerHTML = ''; });
  it('reloads on match-day screens only when no pad is open, nobody is typing and nothing is waiting to send', () => {
    window.location.hash = '#/club-desk/t1';
    expect(safeToReload(document, store(null))).toBe(true);
    expect(safeToReload(document, store('{"m1":{}}'))).toBe(false);
    document.body.innerHTML = '<button class="score-tap">0</button>';
    expect(safeToReload(document, store(null))).toBe(false);
    document.body.innerHTML = '<input id="x">';
    (document.getElementById('x') as HTMLInputElement).focus();
    expect(safeToReload(document, store(null))).toBe(false);
  });
  it('never on other screens', () => {
    window.location.hash = '#/club';
    expect(safeToReload(document, store(null))).toBe(false);
  });
});
