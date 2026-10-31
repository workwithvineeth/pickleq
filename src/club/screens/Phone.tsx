// Phone number with a country code: India (+91, exactly 10 digits) by default; other countries can be picked.

export interface Country { code: string; name: string; min: number; max: number }

export const COUNTRIES: Country[] = [
  { code: '+91', name: 'India', min: 10, max: 10 },
  { code: '+971', name: 'UAE', min: 9, max: 9 },
  { code: '+1', name: 'USA / Canada', min: 10, max: 10 },
  { code: '+44', name: 'UK', min: 10, max: 10 },
  { code: '+65', name: 'Singapore', min: 8, max: 8 },
  { code: '+61', name: 'Australia', min: 9, max: 9 },
  { code: '+974', name: 'Qatar', min: 8, max: 8 },
  { code: '+966', name: 'Saudi Arabia', min: 9, max: 9 },
  { code: '+977', name: 'Nepal', min: 10, max: 10 },
  { code: '+880', name: 'Bangladesh', min: 10, max: 10 },
  { code: '+94', name: 'Sri Lanka', min: 9, max: 9 },
];

/** Splits a saved number ("+91 9876543210") back into country and digits. A bare 10-digit number is Indian. */
export function splitPhone(v: string | undefined): { country: string; digits: string } {
  const s = (v ?? '').trim();
  const c = [...COUNTRIES].sort((a, b) => b.code.length - a.code.length).find((x) => s.startsWith(x.code));
  return c ? { country: c.code, digits: s.slice(c.code.length).replace(/\D/g, '') } : { country: '+91', digits: s.replace(/\D/g, '').slice(-10) };
}

/** What's wrong with the number, or null. */
export function phoneProblem(country: string, digits: string): string | null {
  const c = COUNTRIES.find((x) => x.code === country) ?? COUNTRIES[0];
  if (digits.length < c.min || digits.length > c.max) {
    return c.min === c.max ? `Enter the ${c.min}-digit ${c.name} mobile number, without ${c.code}` : `Enter a ${c.name} number of ${c.min} to ${c.max} digits`;
  }
  if (c.code === '+91' && !/^[6-9]/.test(digits)) return 'An Indian mobile number starts with 6, 7, 8 or 9';
  return null;
}

export const joinPhone = (country: string, digits: string) => `${country} ${digits}`;

export function PhoneField({ country, digits, onChange, id = 'phone' }: { country: string; digits: string; onChange: (country: string, digits: string) => void; id?: string }) {
  const c = COUNTRIES.find((x) => x.code === country) ?? COUNTRIES[0];
  return (
    <div className="section" style={{ gap: 6 }}>
      <label className="label" htmlFor={id}>Phone number</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <select className="input" aria-label="Country code" value={country} onChange={(e) => onChange(e.target.value, digits)} style={{ width: 'auto', flex: '0 0 auto', maxWidth: 140 }}>
          {COUNTRIES.map((x) => <option key={x.code} value={x.code}>{x.code} {x.name}</option>)}
        </select>
        <input id={id} className="input" type="tel" inputMode="numeric" autoComplete="tel-national" placeholder={c.code === '+91' ? '9876543210' : ''}
          value={digits} onChange={(e) => onChange(country, e.target.value.replace(/\D/g, '').slice(0, c.max))} style={{ flex: 1 }} />
      </div>
    </div>
  );
}
