import {expect,it} from 'vitest';
import {connectionLost,liveChipLabel,updatedLabel} from './RallyLive';

it('says how fresh the live scores are', () => {
  const at=new Date(2026,10,15,19,42).getTime();
  expect(updatedLabel(at,at+12_000,false,false)).toBe('Updated 12s ago');
  expect(updatedLabel(at,at+5*60_000,false,false)).toMatch(/^Updated 7:42/);
  expect(updatedLabel(at,at,true,false)).toBe('Can’t reach live scores · retrying');
  expect(updatedLabel(null,at,false,true)).toBe('Sample scores');
  expect(updatedLabel(null,at,false,false)).toBe('Loading scores');
});

it('calls the connection lost after two failed refreshes in a row, or a minute of silence', () => {
  const at=1_000_000;
  expect(connectionLost(0,at,at+30_000)).toBe(false);
  expect(connectionLost(1,at,at+25_000)).toBe(false);
  expect(connectionLost(2,at,at+45_000)).toBe(true);
  expect(connectionLost(0,at,at+61_000)).toBe(true);
  // Before the first load there is nothing to be stale yet; the page shows its skeleton.
  expect(connectionLost(0,null,at)).toBe(false);
});

it('shows the chip text for a lost connection and the real age otherwise', () => {
  const at=Date.now();
  expect(liveChipLabel({lost:true,sample:false,directoryError:false,today:'Sun 15 Nov'})).toBe('Connection lost · scores may be behind');
  expect(liveChipLabel({lost:false,sample:false,directoryError:false,today:'Sun 15 Nov'})).toBe('Live · Sun 15 Nov');
  expect(liveChipLabel({lost:false,sample:true,directoryError:false,today:'Sun 15 Nov'})).toBe('Sample scores · Sun 15 Nov');
  expect(liveChipLabel({lost:false,sample:true,directoryError:true,today:'Sun 15 Nov'})).toBe('Can’t reach live scores · showing a sample');
  expect(updatedLabel(at,at+3_000,false,false)).toBe('Updated 3s ago');
});


it('keeps final results final after polling stops', () => {
  expect(connectionLost(0, 1_000, 1_000_000, true)).toBe(false);
  expect(liveChipLabel({lost:false,sample:false,directoryError:false,today:'Sun 15 Nov',finished:true})).toBe('Final results · Sun 15 Nov');
});
