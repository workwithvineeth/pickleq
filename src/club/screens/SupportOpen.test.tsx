import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SupportOpenButton } from './Lifecycle';

describe('admin support buttons', () => {
  it('Create tournament starts an audited support session, then opens the new-tournament form for that club', async () => {
    const startSupport = vi.fn().mockResolvedValue(undefined); const go = vi.fn();
    render(<SupportOpenButton b={{ startSupport }} clubId="c1" newTournament reason="Admin club page" go={go} label="+ Create tournament" primary />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '+ Create tournament' })); });
    expect(startSupport).toHaveBeenCalledWith('c1', 'Admin club page');
    expect(go).toHaveBeenLastCalledWith('club-tournament-new', 'c1');
  });
});
