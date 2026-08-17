import { describe, expect, it } from 'vitest';
import { IntegrityError } from '../src/main/domain/errors';
import { CryptoService } from '../src/main/security/crypto-service';

describe('CryptoService', () => {
  it('хеширует и проверяет пароль через Argon2id', async () => {
    const crypto = new CryptoService();
    const hash = await crypto.hashPassword('пароль любой сложности 🔐');
    expect(hash).toContain('$argon2id$');
    await expect(crypto.verifyPassword(hash, 'пароль любой сложности 🔐')).resolves.toBe(true);
    await expect(crypto.verifyPassword(hash, 'другой')).resolves.toBe(false);
  });

  it('шифрует, расшифровывает и проверяет integrity metadata', () => {
    const crypto = new CryptoService();
    const key = crypto.createDataKey();
    const associatedData = 'game:test:user:test:revision:1';
    const encrypted = crypto.encryptJson({ cash: '100.01' }, key, associatedData);
    const integrity = crypto.integrity(encrypted, key, associatedData);
    crypto.verifyIntegrity(encrypted, integrity, key, associatedData);
    expect(crypto.decryptJson(encrypted, key, associatedData)).toEqual({ cash: '100.01' });
    key.fill(0);
  });

  it('отклоняет изменённый ciphertext и неверный authentication material', () => {
    const crypto = new CryptoService();
    const key = crypto.createDataKey();
    const wrongKey = crypto.createDataKey();
    const associatedData = 'save:test';
    const encrypted = crypto.encryptJson({ holdings: 5 }, key, associatedData);
    const envelope = JSON.parse(encrypted);
    envelope.ciphertext = `${envelope.ciphertext.slice(0, -2)}AA`;
    expect(() => crypto.decryptJson(JSON.stringify(envelope), key, associatedData)).toThrow(
      IntegrityError,
    );
    expect(() => crypto.decryptJson(encrypted, wrongKey, associatedData)).toThrow(IntegrityError);
    expect(() => crypto.decryptJson(encrypted, key, 'save:other')).toThrow(IntegrityError);
    key.fill(0);
    wrongKey.fill(0);
  });
});
