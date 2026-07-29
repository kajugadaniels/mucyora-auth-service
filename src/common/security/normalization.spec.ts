import { maskIdentifier } from './masking';
import { normalizeEmail, normalizeRwandaNid } from './normalization';

describe('normalization and masking', () => {
  it('normalizes email casing and compatibility characters', () => {
    expect(normalizeEmail('  USER@Example.COM  ')).toBe('user@example.com');
  });

  it('normalizes permitted NID separators without numeric conversion', () => {
    expect(normalizeRwandaNid('1000-0000 0000-0001')).toBe('1000000000000001');
  });

  it('rejects invalid NID characters and length', () => {
    expect(() => normalizeRwandaNid('1000/0000/0000/0001')).toThrow('16-digit');
    expect(() => normalizeRwandaNid('123')).toThrow('16-digit');
  });

  it('masks all but the approved suffix', () => {
    expect(maskIdentifier('1000000000000001')).toBe('************0001');
  });
});
