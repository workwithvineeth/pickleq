import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { consentProblem, GRIEVANCE, NOTICE_VERSION } from '../privacy';
import { PrivacyNotice } from './PrivacyNotice';

describe('Privacy notice (DPDP)', () => {
  it('says what is collected, who sees it, the rights, and who to complain to', () => {
    const go = vi.fn();
    render(<PrivacyNotice go={go} />);
    expect(screen.getByRole('heading', { name: 'Your data on RallyQ.' })).toBeInTheDocument();
    for (const t of ['What we collect and why', 'Who sees it', 'How long we keep it', 'Your rights', 'Complaints']) expect(screen.getByRole('region', { name: t })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: GRIEVANCE.email })).toHaveAttribute('href', `mailto:${GRIEVANCE.email}`);
    expect(screen.getByText(/18 or over/)).toBeInTheDocument();
    expect(screen.getByText(/Data Protection Board of India/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Manage my data' }));
    expect(go).toHaveBeenCalledWith('club-player-studio', 'profile');
  });

  it('needs the tick before an entry is sent, and versions the notice by date', () => {
    expect(consentProblem(false)).toBe('Tick the box to agree to the privacy notice');
    expect(consentProblem(true)).toBeNull();
    expect(NOTICE_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
