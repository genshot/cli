import { describe, expect, it } from 'vitest';

import { balanceJson, whoamiJson } from '#cli/commands/account.ts';
import type { GenshotConfig } from '#cli/config.ts';

const SAMPLE: GenshotConfig = {
  apiKey: 'gsk_live_abc123xyz',
  apiKeyId: 'key_0123456789',
  apiUrl: 'https://api.example.test',
  email: 'dev@example.com',
  mode: 'live',
  userId: 'usr_0123456789',
};

describe('balanceJson', () => {
  it('returns a single-field balance object for --json', () => {
    expect(balanceJson(10)).toEqual({ balance: 10 });
    expect(balanceJson(0)).toEqual({ balance: 0 });
  });
});

describe('whoamiJson', () => {
  it('includes identity fields and a redacted api key (never the full raw key)', () => {
    const identity = whoamiJson(SAMPLE, '/tmp/genshot-config.json');
    expect(identity).toEqual({
      apiKey: 'gsk_live_abc…',
      apiUrl: 'https://api.example.test',
      configPath: '/tmp/genshot-config.json',
      email: 'dev@example.com',
      mode: 'live',
      userId: 'usr_0123456789',
    });
    expect(identity.apiKey).not.toBe(SAMPLE.apiKey);
    expect(SAMPLE.apiKey.startsWith(identity.apiKey.slice(0, 12))).toBe(true);
  });
});
