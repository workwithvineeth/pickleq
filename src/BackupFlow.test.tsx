import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { createBackup } from './backup/backup';
import { db } from './db/db';
import { activeMatches, addMatch } from './db/matches';
import { sampleMatches } from './db/sample';

beforeEach(async () => {
  await db.matches.clear();
  await db.players.clear();
  localStorage.clear();
  window.location.hash = '';
});

async function seed() {
  for (const m of sampleMatches()) await addMatch(m);
}

describe('backup screen', () => {
  it('reminds on Home when there are matches and no backup yet', async () => {
    await seed();
    render(<App />);
    expect(await screen.findByText('Matches not backed up yet')).toBeInTheDocument();
  });

  it('refuses mismatched passwords, then creates a backup and clears the reminder', async () => {
    await seed();
    window.location.hash = '#/backup';
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText('Backup password'), 'court-green-11');
    await user.type(screen.getByLabelText('Type it again'), 'court-green-12');
    await user.click(screen.getByRole('button', { name: 'Create backup' }));
    expect(screen.getByRole('status')).toHaveTextContent('don’t match');
    await user.clear(screen.getByLabelText('Type it again'));
    await user.type(screen.getByLabelText('Type it again'), 'court-green-11');
    await user.click(screen.getByRole('button', { name: 'Create backup' }));
    expect(await screen.findByText(/Backup downloaded/)).toBeInTheDocument();
    expect(screen.getByText('Last backup: today')).toBeInTheDocument();
  });

  it('restores a backup file, replacing what is on the phone', async () => {
    await seed();
    const fileText = await createBackup('court-green-11');
    const expected = (await activeMatches()).length;
    await db.matches.clear();
    window.location.hash = '#/backup';
    const user = userEvent.setup();
    render(<App />);
    await user.upload(await screen.findByLabelText('Backup file'), new File([fileText], 'pickleq-backup.pickleq', { type: 'application/json' }));
    await user.type(screen.getByLabelText('Password for this backup'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Open backup' }));
    expect(await screen.findByText(/Wrong password/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Password for this backup'));
    await user.type(screen.getByLabelText('Password for this backup'), 'court-green-11');
    await user.click(screen.getByRole('button', { name: 'Open backup' }));
    expect(await screen.findByText(new RegExp(`has ${expected} matches`))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Replace and restore' }));
    expect(await screen.findByText(`Restored ${expected} matches.`)).toBeInTheDocument();
    expect(await activeMatches()).toHaveLength(expected);
  });
});
