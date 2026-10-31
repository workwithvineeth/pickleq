import { describe, expect, it } from 'vitest';
import { joinPhone, phoneProblem, splitPhone } from './screens/Phone';

describe('club phone numbers', () => {
  it('India by default: exactly 10 digits, starting 6–9', () => {
    expect(phoneProblem('+91', '987654321')).toBe('Enter the 10-digit India mobile number, without +91');
    expect(phoneProblem('+91', '98765432101')).toBe('Enter the 10-digit India mobile number, without +91');
    expect(phoneProblem('+91', '1234567890')).toBe('An Indian mobile number starts with 6, 7, 8 or 9');
    expect(phoneProblem('+91', '9876543210')).toBeNull();
  });
  it('other countries use their own length', () => {
    expect(phoneProblem('+971', '501234567')).toBeNull();
    expect(phoneProblem('+65', '81234567')).toBeNull();
    expect(phoneProblem('+65', '812345678')).toMatch(/8-digit Singapore/);
  });
  it('saves as "+91 9876543210" and reads back, also older bare numbers', () => {
    expect(joinPhone('+91', '9876543210')).toBe('+91 9876543210');
    expect(splitPhone('+971 501234567')).toEqual({ country: '+971', digits: '501234567' });
    expect(splitPhone('98765 43210')).toEqual({ country: '+91', digits: '9876543210' });
  });
});
