import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const writePushedChaco = vi.fn();
vi.mock('@/lib/chacoPushStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../chacoPushStore')>();
  return { ...actual, isStoreConfigured: () => true, writePushedChaco };
});

const { POST } = await import('../../app/api/pyg-rates/push/route');

const BODY = { compra: 5630, venta: 5740, updatedAt: '12/10/2026 17:25', readAt: new Date().toISOString() };
const req = (body: unknown, token?: string) =>
  new Request('http://localhost/api/pyg-rates/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('POST /api/pyg-rates/push', () => {
  beforeEach(() => {
    vi.stubEnv('PUSH_TOKEN', 'secret-token');
    writePushedChaco.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('401 sin token o con token incorrecto', async () => {
    expect((await POST(req(BODY))).status).toBe(401);
    expect((await POST(req(BODY, 'wrong'))).status).toBe(401);
    expect(writePushedChaco).not.toHaveBeenCalled();
  });

  it('400 si la tasa no pasa la cordura', async () => {
    const res = await POST(req({ ...BODY, compra: 3000 }, 'secret-token'));
    expect(res.status).toBe(400);
    expect(writePushedChaco).not.toHaveBeenCalled();
  });

  it('400 con JSON inválido', async () => {
    expect((await POST(req('{no json', 'secret-token'))).status).toBe(400);
  });

  it('200 y guarda el valor con token correcto', async () => {
    const res = await POST(req(BODY, 'secret-token'));
    expect(res.status).toBe(200);
    expect(writePushedChaco).toHaveBeenCalledWith(BODY);
  });

  it('503 si PUSH_TOKEN no está configurado', async () => {
    vi.stubEnv('PUSH_TOKEN', '');
    expect((await POST(req(BODY, 'secret-token'))).status).toBe(503);
  });
});
