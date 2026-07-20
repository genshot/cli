import process from 'node:process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { printJson, renderError, startUi } from '#cli/ui.ts';

afterEach(() => {
  vi.restoreAllMocks();
  // Reset to non-json so later suites do not inherit silent mode.
  startUi();
});

describe('printJson', () => {
  it('writes exactly one JSON object line to stdout', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    printJson({ balance: 7 });
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('{"balance":7}\n');
  });
});

describe('renderError', () => {
  it('writes to stderr under --json (silent) so stdout stays clean for one object', () => {
    startUi({ json: true });
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    renderError('Not signed in. Run `genshot login` first.');
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith('Not signed in. Run `genshot login` first.\n');
  });
});
