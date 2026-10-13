import { describe, it, expect } from 'vitest';
import { isPyBusinessHours } from '../businessHours';

// Paraguay es UTC-3 fijo: 11:00Z = 08:00 PY, 22:00Z = 19:00 PY.
describe('isPyBusinessHours', () => {
  it.each([
    ['lunes 08:00 PY', '2026-10-12T11:00:00Z', true],
    ['lunes 07:59 PY', '2026-10-12T10:59:00Z', false],
    ['lunes 19:00 PY', '2026-10-12T22:00:00Z', true],
    ['lunes 19:01 PY', '2026-10-12T22:01:00Z', false],
    ['sábado 12:00 PY', '2026-10-17T15:00:00Z', true],
    ['domingo 12:00 PY', '2026-10-18T15:00:00Z', false],
  ])('%s → %s', (_label, iso, expected) => {
    expect(isPyBusinessHours(new Date(iso))).toBe(expected);
  });
});
