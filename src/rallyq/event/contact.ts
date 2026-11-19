/** A link that reaches the organiser: a web link, an email, or a phone number as WhatsApp. */
export function contactHref(contact?: string) {
  const t = contact?.trim(); if (!t) return null;
  if (/^https:\/\//i.test(t)) return t.split(/\s/)[0];
  const mail = /[^\s@]+@[^\s@]+\.[^\s@]+/.exec(t); if (mail) return 'mailto:' + mail[0];
  const n = phoneDigits(t);
  return n ? 'https://wa.me/' + n : null;
}

/** A tel: link for a phone number in the contact, or null when there is none. */
export function callHref(contact?: string) {
  const t = contact?.trim(); if (!t || /^https:\/\//i.test(t) || /@/.test(t)) return null;
  const n = phoneDigits(t);
  return n ? 'tel:+' + n : null;
}

// shortcut: a bare 10-digit number is read as Indian (+91); upgrade when clubs outside India list numbers.
function phoneDigits(t: string) {
  const n = t.replace(/[^\d]/g, '');
  return n.length === 10 ? '91' + n : n.length > 10 && n.length <= 15 ? n : null;
}
