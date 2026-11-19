import { expect, it } from 'vitest';
import { directEntries } from './Inbox';

it('counts entries the organiser added or imported, not ones already counted through a registration (audit 19 Nov)', () => {
  const entries = [
    { id: 'e1', divisionId: 'd1', status: 'active' as const },
    { id: 'e2', divisionId: 'd1' },
    { id: 'e3', divisionId: 'd1', status: 'withdrawn' as const },
    { id: 'e4', divisionId: 'd2' },
  ];
  expect(directEntries([{ entryId: 'e1' }, { entryId: undefined }], entries, 'd1')).toBe(1);
  expect(directEntries([], entries, 'd1')).toBe(2);
  expect(directEntries([], entries, 'd2')).toBe(1);
});
