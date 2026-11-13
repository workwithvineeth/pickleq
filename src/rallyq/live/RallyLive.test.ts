import {expect,it} from 'vitest';
import {updatedLabel} from './RallyLive';

it('says how fresh the live scores are', () => {
  const at=new Date(2026,10,15,19,42).getTime();
  expect(updatedLabel(at,at+12_000,false,false)).toBe('Updated 12s ago');
  expect(updatedLabel(at,at+5*60_000,false,false)).toMatch(/^Updated 7:42/);
  expect(updatedLabel(at,at,true,false)).toBe('Can’t reach live scores · retrying');
  expect(updatedLabel(null,at,false,true)).toBe('Sample scores');
  expect(updatedLabel(null,at,false,false)).toBe('Loading scores');
});
