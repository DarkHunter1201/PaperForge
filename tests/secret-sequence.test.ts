import { describe, expect, it } from 'vitest';
import { matchesSecretSequence } from '../src/renderer/src/hooks/useSecretSequence';

describe('Hidden administrative sequence', () => {
  it('сопоставляет только предусмотренную последовательность через SHA-256', async () => {
    await expect(matchesSecretSequence('unlim')).resolves.toBe(true);
    await expect(matchesSecretSequence('admin')).resolves.toBe(false);
    await expect(matchesSecretSequence('unlimit')).resolves.toBe(false);
  });
});
