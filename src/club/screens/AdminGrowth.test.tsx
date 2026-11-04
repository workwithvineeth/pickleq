import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AdminDashboard } from './Admin';

const backend = vi.hoisted(() => ({ kind: 'server', isPlatformAdmin: vi.fn(), adminOverview: vi.fn(async () => null), approvalQueue: vi.fn(async () => []) }));
vi.mock('../index', async (importOriginal) => ({
  ...await importOriginal<typeof import('../index')>(),
  eventsBackend: () => backend,
}));

it('denies direct growth routes to non-admins', async () => {
  backend.isPlatformAdmin.mockResolvedValue(false);
  const props = { go: vi.fn(), onBack: vi.fn() };
  const view = render(<AdminDashboard section="branding" {...props} />);
  await screen.findByText('Only PaddleQ admins can see this.');
  expect(screen.queryByText('PaddleQ Branding Kit')).toBeNull();
  view.rerender(<AdminDashboard section="marketing" {...props} />);
  expect(screen.queryByText('Sample Data Preview')).toBeNull();
});

it('shows editable artwork and isolates fictional numbers from real mode', async () => {
  backend.isPlatformAdmin.mockResolvedValue(true);
  const props = { go: vi.fn(), onBack: vi.fn() };
  const view = render(<AdminDashboard section="branding" {...props} />);
  expect((await screen.findByRole('link', { name: 'Download Tournament poster' })).getAttribute('href')).toBeTruthy();
  view.rerender(<AdminDashboard section="marketing" {...props} />);
  expect(screen.getByText('Real Data · Not connected')).toBeTruthy();
  expect(screen.queryByText('Attributed registration sessions')).toBeNull();
  fireEvent.click(screen.getByRole('checkbox', { name: /Sample Data Preview/ }));
  expect(screen.getByText('51')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Channel'), { target: { value: 'instagram' } });
  expect(screen.getByText('23')).toBeTruthy();
  fireEvent.click(screen.getByRole('checkbox', { name: /Sample Data Preview/ }));
  expect(screen.queryByText('Attributed registration sessions')).toBeNull();
});


it('requires Platform Admin access and explicit opt-in for fictional Circuit rankings', async () => {
  const props = { go: vi.fn(), onBack: vi.fn() };
  backend.isPlatformAdmin.mockResolvedValue(false);
  const denied = render(<AdminDashboard section="circuit" {...props} />);
  await screen.findByText('Only PaddleQ admins can see this.');
  expect(screen.queryByRole('checkbox', { name: 'Sample Data Preview' })).toBeNull();
  denied.unmount();

  backend.isPlatformAdmin.mockResolvedValue(true);
  render(<AdminDashboard section="circuit" {...props} />);
  const toggle = await screen.findByRole('checkbox', { name: 'Sample Data Preview' });
  expect(screen.queryByText('Cedar Court Pickleball')).toBeNull();
  fireEvent.click(toggle);
  expect(screen.getByText('Cedar Court Pickleball')).toBeTruthy();
  expect(screen.getByText('Demo Player A')).toBeTruthy();
  fireEvent.click(toggle);
  expect(screen.queryByText('Cedar Court Pickleball')).toBeNull();
  expect(screen.queryByText('Demo Player A')).toBeNull();
});

it('keeps overview demo data opt-in and uses live loaders only in Real Data mode', async () => {
  const props = { go: vi.fn(), onBack: vi.fn() };
  backend.isPlatformAdmin.mockResolvedValue(false);
  const denied = render(<AdminDashboard section="overview" {...props} />);
  await screen.findByText('Only PaddleQ admins can see this.');
  expect(screen.queryByRole('button', { name: 'Demo Preview' })).toBeNull();
  denied.unmount();

  backend.isPlatformAdmin.mockResolvedValue(true);
  render(<AdminDashboard section="overview" {...props} />);
  const demo = await screen.findByRole('button', { name: 'Demo Preview' });
  expect(screen.getByRole('button', { name: 'Real Data' }).getAttribute('aria-pressed')).toBe('true');
  expect(screen.queryByText('Cedar Court Rally Day')).toBeNull();
  expect(backend.adminOverview).toHaveBeenCalledTimes(1);
  expect(backend.approvalQueue).toHaveBeenCalledTimes(1);
  fireEvent.click(demo);
  expect(screen.getByText('Cedar Court Rally Day')).toBeTruthy();
  expect(screen.getByText('Attributed registration sessions')).toBeTruthy();
  expect(backend.adminOverview).toHaveBeenCalledTimes(1);
  expect(backend.approvalQueue).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Real Data' }));
  expect(screen.queryByText('Cedar Court Rally Day')).toBeNull();
  expect(screen.queryByText('Attributed registration sessions')).toBeNull();
  expect(backend.adminOverview).toHaveBeenCalledTimes(2);
});
