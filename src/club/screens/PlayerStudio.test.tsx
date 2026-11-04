import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { PlayerStudio } from './PlayerStudio';

const fixture = vi.hoisted(() => ({
  kind: 'server',
  currentUser: vi.fn(async () => ({ id: 'fixture' })),
  studioLogs: vi.fn(async () => []),
  saveStudioLog: vi.fn(async () => undefined),
}));
vi.mock('../index', () => ({
  backend: () => fixture,
  serverBackend: () => fixture,
  rememberReturn: vi.fn(),
}));

it('writes only a self-reported log and cycles a private reflection tag', async () => {
  render(<PlayerStudio go={vi.fn()} onBack={vi.fn()} />);
  await screen.findByRole('heading', { name: 'Log a private match' });
  expect(screen.getByText(/Not connected/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-04' } });
  fireEvent.change(screen.getByLabelText('Opponents'), { target: { value: '  Fixture Player  ' } });
  fireEvent.change(screen.getByLabelText('Your score'), { target: { value: '11' } });
  fireEvent.change(screen.getByLabelText('Opponent score'), { target: { value: '7' } });
  fireEvent.click(screen.getByRole('button', { name: 'Serve' }));
  fireEvent.click(screen.getByRole('button', { name: 'Serve · Needs work' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save private match' }));
  await waitFor(() => expect(fixture.saveStudioLog).toHaveBeenCalledWith(expect.objectContaining({
    kind: 'practice', opponents: 'Fixture Player', score_for: 11, score_against: 7,
    tags: { Serve: 'went-well' },
  }), undefined));
  expect(await screen.findByText('Private match saved.')).toBeInTheDocument();
});
