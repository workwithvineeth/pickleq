// Referee pad skin. PAD5 = true ships "Pad 5 · Ball on Night" (arena-v2-pad5.css).
// Saturday fallback: set PAD5 = false to keep the current v1.2 pad. Nothing else changes either way.
import pad5Raw from './arena-v2-pad5.css?raw';

export const PAD5 = true;
export const padCSS = PAD5 ? pad5Raw : '';
