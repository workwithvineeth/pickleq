import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { pwaMockState } from '../test/pwaRegisterMock';
import { UpdatePrompt } from './UpdatePrompt';

afterEach(() => { pwaMockState.needRefresh = false; pwaMockState.offlineReady = false; });

describe('UpdatePrompt', () => {
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
