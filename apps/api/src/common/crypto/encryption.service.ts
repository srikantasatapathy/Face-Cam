import { Injectable } from '@nestjs/common'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { AppConfigService } from '../../config/app-config.service'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16

/**
 * Envelope encryption for secrets that must be readable again, currently the
 * per-tenant CompreFace API keys.
 *
 * AES-256-GCM is authenticated, so tampering with a stored ciphertext fails
 * loudly on decrypt instead of yielding a corrupted key. A fresh random IV is
 * generated per encryption: reusing one under GCM is catastrophic.
 *
 * Stored format is `iv:tag:ciphertext`, base64 per part.
 */
@Injectable()
export class EncryptionService {
  constructor(private readonly config: AppConfigService) {}

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES)
    const cipher = createCipheriv(ALGORITHM, this.config.encryptionKey, iv)

    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()

    return [iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':')
  }

  decrypt(payload: string): string {
    const parts = payload.split(':')
    if (parts.length !== 3) {
      throw new Error('Malformed ciphertext: expected iv:tag:ciphertext')
    }

    const [ivB64, tagB64, dataB64] = parts as [string, string, string]
    const iv = Buffer.from(ivB64, 'base64')
    const tag = Buffer.from(tagB64, 'base64')

    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
      throw new Error('Malformed ciphertext: bad iv or tag length')
    }

    const decipher = createDecipheriv(ALGORITHM, this.config.encryptionKey, iv)
    decipher.setAuthTag(tag)

    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8')
  }
}
