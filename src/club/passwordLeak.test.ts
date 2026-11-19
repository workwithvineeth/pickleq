import { describe, expect, it } from 'vitest';
import { passwordLeaked } from './authText';

// SHA-1("password1") = E38AD214943DAAD1D64C102FAEC29DE4AFE9DA3D → range E38AD, suffix 214943DAAD1D64C102FAEC29DE4AFE9DA3D
const range = (body: string) => (async (url: string) => {
  expect(url).toBe('https://api.pwnedpasswords.com/range/E38AD');
  return new Response(body, { status: 200 });
}) as unknown as typeof fetch;

describe('leaked password check (HaveIBeenPwned range API, k-anonymity)', () => {
  it('sends only the first 5 hash characters and finds a leaked password', async () => {
    expect(await passwordLeaked('password1', range('0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n214943DAAD1D64C102FAEC29DE4AFE9DA3D:2427\r\n'))).toBe(true);
  });
  it('is fine when the hash isn’t in the list (padding lines with 0 count ignored)', async () => {
    expect(await passwordLeaked('password1', range('214943DAAD1D64C102FAEC29DE4AFE9DA3D:0\r\nABCDEF:3\r\n'))).toBe(false);
  });
  it('never blocks anyone when the check can’t run', async () => {
    const down = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    expect(await passwordLeaked('password1', down)).toBe(false);
  });
});
