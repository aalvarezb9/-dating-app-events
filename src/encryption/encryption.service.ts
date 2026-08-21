import { Injectable, Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';
import { SharedConfigService } from '../config/env.config';

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private keyPromise: Promise<Buffer>;

  constructor(private config: SharedConfigService) {
    const password = this.config.get('ENCRYPTION_KEY');

    if (!password) {
      throw new Error('ENCRYPTION_KEY environment variable is required');
    }

    if (password.length < 32) {
      throw new Error('ENCRYPTION_KEY must be at least 32 characters long');
    }

    // Derive key from password using scrypt
    this.keyPromise = promisify(scrypt)(password, 'salt', 32) as Promise<Buffer>;

    this.logger.log('EncryptionService initialized');
  }

  /**
   * Encrypt data using AES-256-GCM
   * Returns format: iv:authTag:encrypted
   */
  async encrypt(data: string): Promise<string> {
    try {
      const key = await this.keyPromise;
      const iv = randomBytes(16);
      const cipher = createCipheriv(this.algorithm, key, iv);

      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();

      // Format: iv:authTag:encrypted
      return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    } catch (error) {
      this.logger.error(`Encryption failed: ${error.message}`);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt data encrypted with encrypt()
   * Expects format: iv:authTag:encrypted
   */
  async decrypt(encryptedData: string): Promise<string> {
    try {
      const key = await this.keyPromise;
      const parts = encryptedData.split(':');

      if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format');
      }

      const [ivHex, authTagHex, encrypted] = parts;

      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');

      const decipher = createDecipheriv(this.algorithm, key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      this.logger.error(`Decryption failed: ${error.message}`);
      throw new Error('Failed to decrypt data');
    }
  }
}
