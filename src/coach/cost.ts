/** Claude Haiku 5.5 list prices, USD per million tokens (platform.claude.com, checked 28 Oct 2026). */
export const MODEL = 'claude-haiku-5-5';
const PRICE = { short: { input: 0.10, output: 0.50 }, long: { input: 0.50, output: 2.50 } };
const LONG_PROMPT = 100_000;

export interface Usage { input: number; output: number }

export function costUsd(u: Usage): number {
  const p = u.input > LONG_PROMPT ? PRICE.long : PRICE.short;
  return (u.input * p.input + u.output * p.output) / 1_000_000;
}

export const DEFAULT_INR_PER_USD = 95;

export function fmtUsd(usd: number): string {
  if (usd === 0) return '$0';
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}
export function fmtInr(usd: number, rate: number): string {
  const inr = usd * rate;
  return inr < 1 ? `₹${inr.toFixed(2)}` : `₹${inr.toFixed(inr < 10 ? 1 : 0)}`;
}
