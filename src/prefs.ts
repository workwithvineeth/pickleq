import { channel } from './config';
import { DEFAULT_FORMAT, type Category, type Format, type MatchType } from './domain/types';

export interface LogPrefs { type: MatchType; category: Category; format: Format }
const KEY = `pickleq-${channel}-log-prefs`;
const fallback: LogPrefs = { type: 'doubles', category: 'casual', format: DEFAULT_FORMAT };

/** Remembers the last match type, category and format so the next log starts there. */
export function loadPrefs(): LogPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...fallback, ...(JSON.parse(raw) as Partial<LogPrefs>) } : fallback;
  } catch {
    return fallback;
  }
}

export function savePrefs(p: LogPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: the defaults still work */
  }
}
