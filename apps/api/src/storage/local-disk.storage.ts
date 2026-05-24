import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, normalize, resolve, sep } from 'node:path'
import { AppConfigService } from '../config/app-config.service'
import type { StorageService, StoredObject } from './storage.interface'

/**
 * Local disk storage.
 *
 * Suitable for a single-server deployment. Two things to remember: the
 * directory must be a mounted volume or a redeploy erases it, and it has to be
 * backed up alongside the Postgres dump, because the database alone is no
 * longer a complete backup.
 */
@Injectable()
export class LocalDiskStorage implements StorageService {
  private readonly logger = new Logger(LocalDiskStorage.name)
  private readonly root: string

  constructor(private readonly config: AppConfigService) {
    this.root = resolve(process.cwd(), this.config.storage.localDir)
  }

  async put(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
    const path = this.resolveKey(key)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, body)
    return { key, size: body.byteLength, contentType }
  }

  async get(key: string): Promise<Buffer> {
    try {
      return await readFile(this.resolveKey(key))
    } catch {
      throw new NotFoundException({ code: 'OBJECT_NOT_FOUND', message: 'File not found' })
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolveKey(key))
      return true
    } catch {
      return false
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true })
  }

  async deletePrefix(prefix: string): Promise<number> {
    const path = this.resolveKey(prefix)
    try {
      await rm(path, { recursive: true, force: true })
      return 1
    } catch (error) {
      this.logger.warn(`Failed to remove prefix ${prefix}: ${String(error)}`)
      return 0
    }
  }

  /**
   * Returns a signed API path, not a file path.
   *
   * There is no public mount to link to, deliberately: face images are
   * biometric data and must always pass through an authorised endpoint. The
   * signature makes the URL unguessable and short-lived even so.
   */
  async signedUrl(key: string, ttlSeconds?: number): Promise<string> {
    const ttl = ttlSeconds ?? this.config.storage.signedUrlTtl
    const expires = Math.floor(Date.now() / 1000) + ttl
    const signature = this.sign(key, expires)

    return `/api/files/${encodeURIComponent(key)}?expires=${expires}&signature=${signature}`
  }

  sign(key: string, expires: number): string {
    return createHmac('sha256', this.config.encryptionKey).update(`${key}:${expires}`).digest('hex')
  }

  /** Constant-time comparison, so the signature cannot be discovered by timing. */
  verify(key: string, expires: number, signature: string): boolean {
    if (!Number.isFinite(expires) || expires * 1000 < Date.now()) return false

    const expected = Buffer.from(this.sign(key, expires), 'hex')
    const provided = Buffer.from(signature, 'hex')

    return expected.length === provided.length && timingSafeEqual(expected, provided)
  }

  describe() {
    return { driver: 'local', location: this.root }
  }

  /**
   * Resolves a key to an absolute path, refusing anything that escapes the
   * storage root. Keys are generated internally, but path traversal is the
   * classic way a file store becomes an arbitrary-read primitive, so the check
   * is enforced rather than assumed.
   */
  private resolveKey(key: string): string {
    const path = resolve(join(this.root, normalize(key)))
    if (path !== this.root && !path.startsWith(this.root + sep)) {
      throw new Error(`Refusing to access a path outside the storage root: ${key}`)
    }
    return path
  }
}
