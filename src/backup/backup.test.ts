import { beforeEach, describe, expect, it } from 'vitest';
import { PickleqDB } from '../db/db';
import { activeMatches, addMatch } from '../db/matches';
import { sampleMatches } from '../db/sample';
import { recordSummary } from '../domain/record';
import { checkNewPassword, createBackup, openBackup, restoreBackup } from './backup';
import { BackupError, parseEnvelope } from './crypto';
import { csvCell, matchesToCsv } from './csv';
import { backupDue } from './status';

const FAST = 1000; // fewer key-derivation rounds keep tests quick; the app uses 310,000
let n = 0;
let d: PickleqDB;
beforeEach(async () => {
  d = new PickleqDB(`backup-test-${++n}`);
  await d.open();
});

async function seed() {
  for (const m of sampleMatches()) await addMatch(m, d);
}

describe('encrypted backup', () => {
  it('round-trips: export, wipe, restore gives back every record and the same stats', async () => {
    await seed();
    const before = await activeMatches(d);
    const file = await createBackup('court-green-11', d, FAST);
    expect(file).not.toContain('Priya'); // names are not readable in the file
    await d.matches.clear();
    await d.players.clear();
    const contents = await openBackup(file, 'court-green-11');
    await restoreBackup(contents, d);
    const after = await activeMatches(d);
    expect(after).toEqual(before);
    expect(recordSummary(after)).toEqual(recordSummary(before));
    expect(await d.players.count()).toBeGreaterThan(0);
  });

  it('rejects a wrong password without touching data', async () => {
    await seed();
    const file = await createBackup('right-password', d, FAST);
    await expect(openBackup(file, 'wrong-password')).rejects.toThrow(BackupError);
    expect((await activeMatches(d)).length).toBe(sampleMatches().length);
  });

  it('detects a changed file', async () => {
    await seed();
    const env = JSON.parse(await createBackup('right-password', d, FAST));
    const bytes = env.data.split('');
    bytes[10] = bytes[10] === 'A' ? 'B' : 'A';
    env.data = bytes.join('');
    await expect(openBackup(JSON.stringify(env), 'right-password')).rejects.toThrow(/Wrong password, or the file has been changed/);
  });

  it('rejects files that are not PICKLEQ backups', () => {
    expect(() => parseEnvelope('hello')).toThrow(BackupError);
    expect(() => parseEnvelope('{"format":"other"}')).toThrow(BackupError);
  });

  it('restores an empty backup to an empty app', async () => {
    const file = await createBackup('empty-backup', d, FAST);
    await seed();
    await restoreBackup(await openBackup(file, 'empty-backup'), d);
    expect(await d.matches.count()).toBe(0);
  });

  it('checks new passwords', () => {
    expect(checkNewPassword('short', 'short')).toMatch(/8 characters/);
    expect(checkNewPassword('long-enough', 'long-enougH')).toMatch(/don’t match/);
    expect(checkNewPassword('long-enough', 'long-enough')).toBeNull();
  });
});

describe('CSV export', () => {
  it('has a header and one row per active match, with tricky text escaped', async () => {
    await seed();
    const csv = matchesToCsv(await activeMatches(d));
    const lines = csv.replace(/^﻿/, '').trim().split('\r\n');
    expect(lines[0]).toMatch(/^Date,Result,Score/);
    expect(lines).toHaveLength(1 + sampleMatches().length);
    expect(csvCell('a, "b"')).toBe('"a, ""b"""');
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
  });
});

describe('backup reminder', () => {
  const DAY = 86_400_000;
  it('stays quiet with no matches, reminds when never backed up or after 7 days', () => {
    expect(backupDue(0, null)).toBe(false);
    expect(backupDue(3, null)).toBe(true);
    expect(backupDue(3, 100 * DAY, 106 * DAY)).toBe(false);
    expect(backupDue(3, 100 * DAY, 107 * DAY)).toBe(true);
  });
});
