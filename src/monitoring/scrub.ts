/**
 * Everything that leaves the phone for Sentry or PostHog goes through here first. Referee court links, desk links and
 * claim links carry a secret in the address, and PINs, emails, phone numbers and DUPR ids must never be sent.
 */
const TOKEN_ROUTES = ['court', 'desk', 'helper', 'club-claim', 'club-join', 'scorer', 'invite', 'partner'];
const SECRET_PARAM = /^(pin|desk_?pin|ref_?pin|token|access_?token|refresh_?token|key|apikey|code|secret|password|email|phone|mobile|dupr|dupr_?id|invite|claim)$/i;
const REMOVED = '[removed]';
const OPAQUE = /^[A-Za-z0-9_-]{20,}$/;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /(?:\+?\d{1,3}[\s-]?)?\d[\d\s-]{8,}\d/g;
const DUPR_ID = /(dupr(?:\s*id)?\s*[:#=]?\s*)[A-Za-z0-9]{4,}/gi;
const PIN_WORD = /(\bpin\b\s*[:#=]?\s*)\d{4,6}/gi;

function scrubSegments(path: string): string {
  const parts = path.split('/');
  for (let i = 0; i < parts.length; i++) {
    const prev = (parts[i - 1] ?? '').toLowerCase();
    if (!parts[i]) continue;
    if (TOKEN_ROUTES.includes(prev)) parts[i] = '[token]';
    else if (prev === 'pin' || prev === 'desk-pin') parts[i] = REMOVED;
    else if (OPAQUE.test(parts[i])) parts[i] = '[id]';
  }
  return parts.join('/');
}

function scrubQuery(q: string): string {
  return q.split('&').map((kv) => {
    const eq = kv.indexOf('=');
    if (eq < 0) return kv;
    return SECRET_PARAM.test(decodeURIComponent(kv.slice(0, eq))) ? `${kv.slice(0, eq)}=${REMOVED}` : kv;
  }).join('&');
}

/** A page address with secrets removed: court/desk/claim tokens, PINs, and contact details in query strings. */
export function scrubUrl(url: string): string {
  if (!url) return url;
  const hashAt = url.indexOf('#');
  const main = hashAt < 0 ? url : url.slice(0, hashAt);
  const hash = hashAt < 0 ? '' : url.slice(hashAt);
  const doPart = (s: string) => {
    const q = s.indexOf('?');
    const path = q < 0 ? s : s.slice(0, q);
    const query = q < 0 ? '' : '?' + scrubQuery(s.slice(q + 1));
    return scrubSegments(path) + query;
  };
  return doPart(main) + (hash ? doPart(hash) : '');
}

/** Free text (error messages): addresses, emails, phone numbers, DUPR ids and PINs removed. */
export function scrubText(text: string): string {
  return text
    .replace(/https?:\/\/[^\s"'<>)]+|\/#\/[^\s"'<>)]+/g, (u) => scrubUrl(u))
    .replace(EMAIL, '[email]')
    .replace(DUPR_ID, '$1[removed]')
    .replace(PIN_WORD, `$1${REMOVED}`)
    .replace(PHONE, '[phone]');
}

function scrubDeep(v: unknown, key = ''): unknown {
  if (typeof v === 'string') return /url|referer|referrer|href|from|to|transaction|origin|location/i.test(key) ? scrubText(scrubUrl(v)) : scrubText(v);
  if (Array.isArray(v)) return v.map((x) => scrubDeep(x, key));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrubDeep(x, k)]));
  return v;
}

interface EventLike { request?: { cookies?: unknown; headers?: Record<string, string>; url?: string; [k: string]: unknown }; user?: unknown; [k: string]: unknown }

/** A Sentry event with addresses, messages, breadcrumbs and tags scrubbed, and no user, cookies or auth headers. */
export function scrubSentryEvent<T extends EventLike>(event: T): T {
  const out = scrubDeep(event) as T;
  delete out.user;
  if (out.request) {
    delete out.request.cookies;
    if (out.request.headers) {
      out.request.headers = Object.fromEntries(Object.entries(out.request.headers).filter(([k]) => !/^(cookie|authorization|x-api-key)$/i.test(k)));
    }
  }
  return out;
}
