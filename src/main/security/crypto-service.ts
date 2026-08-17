import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { Algorithm, hash, hashRaw, verify } from '@node-rs/argon2';
import { IntegrityError, ValidationError } from '../domain/errors';

interface EncryptedEnvelope {
  version: number;
  iv: string;
  ciphertext: string;
  tag: string;
}

const argonOptions = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
  outputLen: 32,
};

function validatePassword(password: string): void {
  if (Buffer.byteLength(password, 'utf8') > 1024 * 1024) {
    throw new ValidationError('Пароль превышает технический предел в 1 MiB');
  }
}

export class CryptoService {
  async hashPassword(password: string): Promise<string> {
    validatePassword(password);
    return hash(password, argonOptions);
  }

  async verifyPassword(passwordHash: string, password: string): Promise<boolean> {
    validatePassword(password);
    return verify(passwordHash, password, { algorithm: Algorithm.Argon2id });
  }

  async deriveWrappingKey(password: string, salt: Buffer): Promise<Buffer> {
    validatePassword(password);
    return hashRaw(password, { ...argonOptions, salt });
  }

  createDataKey(): Buffer {
    return randomBytes(32);
  }

  createSalt(): Buffer {
    return randomBytes(16);
  }

  wrapKey(dataKey: Buffer, wrappingKey: Buffer, userId: string): string {
    return this.encryptBytes(dataKey, wrappingKey, `user-key:${userId}`);
  }

  unwrapKey(envelope: string, wrappingKey: Buffer, userId: string): Buffer {
    return this.decryptBytes(envelope, wrappingKey, `user-key:${userId}`);
  }

  encryptJson(value: unknown, dataKey: Buffer, associatedData: string): string {
    return this.encryptBytes(Buffer.from(JSON.stringify(value), 'utf8'), dataKey, associatedData);
  }

  decryptJson<T>(envelope: string, dataKey: Buffer, associatedData: string): T {
    const plaintext = this.decryptBytes(envelope, dataKey, associatedData);
    try {
      return JSON.parse(plaintext.toString('utf8')) as T;
    } catch {
      throw new IntegrityError('Зашифрованные данные имеют некорректный формат');
    } finally {
      plaintext.fill(0);
    }
  }

  integrity(envelope: string, dataKey: Buffer, associatedData: string): string {
    const integrityKey = Buffer.from(
      hkdfSync('sha256', dataKey, Buffer.alloc(0), 'paperforge-integrity-v1', 32),
    );
    try {
      return createHmac('sha256', integrityKey)
        .update(associatedData, 'utf8')
        .update('\u0000')
        .update(envelope, 'utf8')
        .digest('base64');
    } finally {
      integrityKey.fill(0);
    }
  }

  verifyIntegrity(
    envelope: string,
    expected: string,
    dataKey: Buffer,
    associatedData: string,
  ): void {
    const actual = Buffer.from(this.integrity(envelope, dataKey, associatedData), 'base64');
    const expectedBuffer = Buffer.from(expected, 'base64');
    if (actual.length !== expectedBuffer.length || !timingSafeEqual(actual, expectedBuffer)) {
      throw new IntegrityError();
    }
  }

  private encryptBytes(value: Buffer, key: Buffer, associatedData: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(associatedData, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
    const envelope: EncryptedEnvelope = {
      version: 1,
      iv: iv.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
    };
    return JSON.stringify(envelope);
  }

  private decryptBytes(envelopeValue: string, key: Buffer, associatedData: string): Buffer {
    let envelope: EncryptedEnvelope;
    try {
      envelope = JSON.parse(envelopeValue) as EncryptedEnvelope;
      if (envelope.version !== 1) throw new Error();
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
      decipher.setAAD(Buffer.from(associatedData, 'utf8'));
      decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
        decipher.final(),
      ]);
    } catch {
      throw new IntegrityError();
    }
  }
}
