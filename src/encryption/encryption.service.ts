import { Injectable, Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';
import { SharedConfigService } from '../config/env.config';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const IV_LENGTH = 16;
const FORMAT_V2 = 'v2';

/**
 * AES-256-GCM encryption for sensitive data (e.g. bank account numbers).
 *
 * Formats:
 * - v2 (current): `v2:salt:iv:authTag:encrypted` — the key is derived with scrypt using a
 *   random salt generated per message, so the same plaintext never yields the same key.
 * - legacy: `iv:authTag:encrypted` — key derived with a static salt. Still readable so data
 *   written before v2 keeps decrypting; new data is always written as v2.
 */
@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly password: string;
  private readonly legacyKeyPromise: Promise<Buffer>;

  constructor(private config: SharedConfigService) {
    const password = this.config.get('ENCRYPTION_KEY');

    if (!password) {
      throw new Error('ENCRYPTION_KEY environment variable is required');
    }

    if (password.length < 32) {
      throw new Error('ENCRYPTION_KEY must be at least 32 characters long');
    }

    this.password = password;
    // Key of the legacy format (static salt), only used to read old values
    this.legacyKeyPromise = scryptAsync(password, 'salt', KEY_LENGTH);

    this.logger.log('EncryptionService initialized');
  }

  /**
   * Encrypt data using AES-256-GCM
   * Returns format: v2:salt:iv:authTag:encrypted
   */
  async encrypt(data: string): Promise<string> {
    try {
      const salt = randomBytes(SALT_LENGTH);
      const key = await scryptAsync(this.password, salt, KEY_LENGTH);
      const iv = randomBytes(IV_LENGTH);
      const cipher = createCipheriv(this.algorithm, key, iv);

      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();

      return [
        FORMAT_V2,
        salt.toString('hex'),
        iv.toString('hex'),
        authTag.toString('hex'),
        encrypted,
      ].join(':');
    } catch (error: any) {
      this.logger.error(`Encryption failed: ${error?.message}`);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt data encrypted with encrypt() (v2) or with the legacy format
   */
  async decrypt(encryptedData: string): Promise<string> {
    try {
      const parts = encryptedData.split(':');

      let key: Buffer;
      let ivHex: string;
      let authTagHex: string;
      let encrypted: string;

      if (parts.length === 5 && parts[0] === FORMAT_V2) {
        const [, saltHex, iv, authTag, data] = parts;
        key = await scryptAsync(this.password, Buffer.from(saltHex, 'hex'), KEY_LENGTH);
        [ivHex, authTagHex, encrypted] = [iv, authTag, data];
      } else if (parts.length === 3) {
        key = await this.legacyKeyPromise;
        [ivHex, authTagHex, encrypted] = parts;
      } else {
        throw new Error('Invalid encrypted data format');
      }

      const decipher = createDecipheriv(this.algorithm, key, Buffer.from(ivHex, 'hex'));
      decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error: any) {
      this.logger.error(`Decryption failed: ${error?.message}`);
      throw new Error('Failed to decrypt data');
    }
  }
}
