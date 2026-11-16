import { createHash, timingSafeEqual } from 'node:crypto';

// Hash both sides so timingSafeEqual gets equal-length buffers (does not leak
// the expected token's length).
const tokensMatch = (given: string, expected: string): boolean =>
  timingSafeEqual(
    createHash('sha256').update(given).digest(),
    createHash('sha256').update(expected).digest()
  );

/** Bearer PUSH_TOKEN check shared by the push and gaps endpoints. */
export const checkPushBearer = (request: Request): 'ok' | 'not_configured' | 'unauthorized' => {
  const expected = process.env.PUSH_TOKEN;
  if (!expected) return 'not_configured';
  const auth = request.headers.get('authorization') ?? '';
  const given = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
  return given && tokensMatch(given, expected) ? 'ok' : 'unauthorized';
};

export const clientKey = (request: Request): string =>
  request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
  request.headers.get('x-real-ip') ||
  'unknown';
