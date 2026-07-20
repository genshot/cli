import { rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { Schema } from 'effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clearConfig, configPath, GenshotConfig, loadConfig, saveConfig } from '#cli/config.ts';

const SAMPLE: GenshotConfig = {
  apiKey: 'gsk_live_abc123',
  apiKeyId: 'key_0123456789',
  apiUrl: 'https://example.test',
  email: 'dev@example.com',
  mode: 'live',
  userId: 'usr_0123456789',
};

let counter = 0;
let dir = '';

beforeEach(() => {
  counter += 1;
  dir = join(tmpdir(), `genshot-cli-config-${process.pid}-${counter}`);
  process.env.GENSHOT_CONFIG_PATH = join(dir, 'config.json');
});

afterEach(async () => {
  delete process.env.GENSHOT_CONFIG_PATH;
  await rm(dir, { recursive: true, force: true });
});

describe('config', () => {
  it('round-trips the persisted configuration contract', () => {
    const decoded = Schema.decodeUnknownSync(GenshotConfig)(SAMPLE);

    expect(Schema.encodeSync(GenshotConfig)(decoded)).toEqual(SAMPLE);
  });

  it('writes the config 0600 and round-trips it', async () => {
    await saveConfig(SAMPLE);
    expect(await loadConfig()).toEqual(SAMPLE);
    const mode = (await stat(configPath())).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('returns null when no config exists', async () => {
    expect(await loadConfig()).toBeNull();
  });

  it('clears a stored config', async () => {
    await saveConfig(SAMPLE);
    await clearConfig();
    expect(await loadConfig()).toBeNull();
  });
});
