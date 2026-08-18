import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Env } from './env.schema'

/**
 * Typed accessor over the validated environment.
 *
 * Injecting this instead of ConfigService means no string keys and no optional
 * types at call sites, since validation has already guaranteed every value.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  private get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true })
  }

  get nodeEnv(): Env['NODE_ENV'] {
    return this.get('NODE_ENV')
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production'
  }

  get isDevelopment(): boolean {
    return this.nodeEnv === 'development'
  }

  get apiPort(): number {
    return this.get('API_PORT')
  }

  get webUrl(): string {
    return this.get('WEB_URL')
  }

  get rootDomain(): string {
    return this.get('ROOT_DOMAIN')
  }

  get databaseUrl(): string {
    return this.get('DATABASE_URL')
  }

  get auth() {
    return {
      accessSecret: this.get('JWT_ACCESS_SECRET'),
      refreshSecret: this.get('JWT_REFRESH_SECRET'),
      accessTtl: this.get('JWT_ACCESS_TTL'),
      refreshTtl: this.get('JWT_REFRESH_TTL'),
    }
  }

  /** 32-byte key used to encrypt tenant CompreFace API keys at rest. */
  get encryptionKey(): Buffer {
    return Buffer.from(this.get('ENCRYPTION_KEY'), 'base64')
  }

  get storage() {
    return {
      driver: this.get('FILE_UPLOAD'),
      localDir: this.get('LOCAL_UPLOAD_DIR'),
      signedUrlTtl: this.get('SIGNED_URL_TTL'),
      aws: {
        region: this.get('AWS_REGION'),
        bucket: this.get('AWS_S3_BUCKET'),
        accessKeyId: this.get('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.get('AWS_SECRET_ACCESS_KEY'),
      },
    }
  }

  get compreface() {
    return {
      url: this.get('COMPREFACE_URL'),
      adminApiKey: this.get('COMPREFACE_ADMIN_API_KEY'),
    }
  }

  get antiSpoof() {
    return {
      url: this.get('ANTISPOOF_URL'),
      enabled: this.get('ANTISPOOF_ENABLED'),
      mode: this.get('ANTISPOOF_MODE'),
    }
  }

  get redisUrl(): string {
    return this.get('REDIS_URL')
  }

  get mail() {
    return {
      provider: this.get('MAIL_PROVIDER'),
      apiKey: this.get('MAIL_API_KEY'),
      from: this.get('MAIL_FROM'),
    }
  }
}
