import { describe, expect, it } from 'vitest';

import { createGeneration, getCredits, pollCliDevice, startCliDevice } from '#cli/api.ts';

const jsonResponse = (body: unknown, init?: { status?: number; statusText?: string }): Response => {
  const status = init === undefined || init.status === undefined ? 200 : init.status;
  const statusText = init === undefined || init.statusText === undefined ? 'OK' : init.statusText;

  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { 'Content-Type': 'application/json' },
  });
};

describe('apiRequest (via getCredits)', () => {
  it('calls /api/v1/credits with the bearer token and parses the body', async () => {
    const calls: { init: Parameters<typeof fetch>[1]; url: string }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return jsonResponse({ userId: 'usr_1', balance: 7 });
    };

    const result = await getCredits({
      apiUrl: 'https://api.test',
      apiKey: 'gsk_live_k',
      fetchImpl,
    });

    expect(result).toEqual({ userId: 'usr_1', balance: 7 });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.test/api/v1/credits');
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get('authorization')).toBe('Bearer gsk_live_k');
  });

  it('throws a CliError carrying the API message on a non-2xx response', async () => {
    const fetchImpl: typeof fetch = async () =>
      jsonResponse(
        { error: 'insufficient_credits', message: 'Not enough credits.' },
        { status: 402, statusText: 'Payment Required' },
      );

    await expect(
      getCredits({
        apiUrl: 'https://api.test',
        apiKey: 'gsk_live_k',
        fetchImpl,
      }),
    ).rejects.toThrow('Not enough credits.');
  });
});

describe('CLI device auth API helpers', () => {
  it('starts a device authorization and posts the mode body', async () => {
    const calls: { init: Parameters<typeof fetch>[1]; url: string }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return jsonResponse({
        deviceCode: 'device-code-secret-value',
        userCode: 'ABCD-EFGH',
        verificationUrl: 'https://api.test/api/v1/auth/cli/device/authorize?user_code=ABCD-EFGH',
        expiresIn: 900,
        interval: 5,
      });
    };

    const result = await startCliDevice(
      { apiUrl: 'https://api.test', fetchImpl },
      { mode: 'test' },
    );

    expect(result.userCode).toBe('ABCD-EFGH');
    expect(calls[0]?.url).toBe('https://api.test/api/v1/auth/cli/device/start');
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ mode: 'test' }));
  });

  it('polls a device authorization until complete', async () => {
    const fetchImpl: typeof fetch = async () =>
      jsonResponse({
        status: 'complete',
        userId: 'usr_1',
        email: 'dev@example.com',
        apiKey: 'gsk_live_k',
        apiKeyId: 'key_1',
        mode: 'live',
        balance: 10,
        created: false,
      });

    const result = await pollCliDevice(
      { apiUrl: 'https://api.test', fetchImpl },
      { deviceCode: 'device-code-secret-value' },
    );

    expect(result.status).toBe('complete');
    if (result.status === 'complete') {
      expect(result.apiKey).toBe('gsk_live_k');
    }
  });
});

describe('generation API helpers', () => {
  it('defaults an omitted idempotent replay marker in the create acknowledgement', async () => {
    const fetchImpl: typeof fetch = async () =>
      jsonResponse({ jobId: 'job_123', status: 'queued' }, { status: 202 });

    const result = await createGeneration(
      { apiUrl: 'https://api.test', apiKey: 'gsk_live_k', fetchImpl },
      {
        appStoreUrl: 'https://apps.apple.com/app/example/id123',
        count: 4,
        prompt: 'Clear benefit-led panels',
      },
    );

    expect(result).toEqual({
      jobId: 'job_123',
      status: 'queued',
      idempotentReplay: false,
    });
  });

  it('preserves an explicit idempotent replay marker in the create acknowledgement', async () => {
    const fetchImpl: typeof fetch = async () =>
      jsonResponse(
        { jobId: 'job_existing', status: 'queued', idempotentReplay: true },
        { status: 200 },
      );

    const result = await createGeneration(
      { apiUrl: 'https://api.test', apiKey: 'gsk_live_k', fetchImpl },
      {
        appStoreUrl: 'https://apps.apple.com/app/example/id123',
        count: 4,
        prompt: 'Clear benefit-led panels',
      },
    );

    expect(result.idempotentReplay).toBe(true);
  });
});
