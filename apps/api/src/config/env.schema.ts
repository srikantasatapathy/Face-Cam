import { z } from 'zod'

/**
 * Every environment variable the API reads, validated once at boot.
 *
 * The app refuses to start if anything is missing or malformed. A misconfigured
 * service that boots and fails later under load is far worse than one that
 * never starts, especially for the storage and face-engine credentials.
 */

const durationString = z.string().regex(/^\d+[smhd]$/, 'Must be a duration like 15m, 24h or 7d')

const base64Key = (bytes: number, name: string) =>
  z.string().refine((value) => {
    try {
      return Buffer.from(value, 'base64').length === bytes
    } catch {
      return false
    }
  }, `${name} must be ${bytes} base64-encoded bytes (openssl rand -base64 ${bytes})`)

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().positive().default(4000),
    API_URL: z.string().url().default('http://localhost:4000'),
    WEB_URL: z.string().url().default('http://localhost:3100'),
    ROOT_DOMAIN: z.string().min(1).default('localhost:3100'),

    DATABASE_URL: z.string().url().startsWith('postgresql://', 'Must be a postgresql:// URL'),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    JWT_ACCESS_TTL: durationString.default('15m'),
    JWT_REFRESH_TTL: durationString.default('7d'),
    ENCRYPTION_KEY: base64Key(32, 'ENCRYPTION_KEY'),

    FILE_UPLOAD: z.enum(['local', 'aws']).default('local'),
    LOCAL_UPLOAD_DIR: z.string().default('./uploads'),
    AWS_REGION: z.string().optional(),
    AWS_S3_BUCKET: z.string().optional(),
    AWS_ACCESS_KEY_ID: z.string().optional(),
    AWS_SECRET_ACCESS_KEY: z.string().optional(),
    SIGNED_URL_TTL: z.coerce.number().int().positive().default(300),

    COMPREFACE_URL: z.string().url().default('http://localhost:8000'),
    COMPREFACE_ADMIN_API_KEY: z.string().optional(),

    ANTISPOOF_URL: z.string().url().default('http://localhost:8081'),
    ANTISPOOF_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    ANTISPOOF_MODE: z.enum(['log', 'enforce']).default('log'),

    REDIS_URL: z.string().url().default('redis://localhost:6379'),

    MAIL_PROVIDER: z.enum(['resend', 'ses', 'postmark', 'console']).default('console'),
    MAIL_API_KEY: z.string().optional(),
    MAIL_FROM: z.string().email().default('no-reply@facecam.local'),
  })
  // The AWS driver needs its credentials present. Checking this here means a
  // deploy with FILE_UPLOAD=aws and a blank bucket fails at boot, not on the
  // first face upload.
  .superRefine((env, ctx) => {
    if (env.FILE_UPLOAD !== 'aws') return

    const required: Array<keyof typeof env> = [
      'AWS_REGION',
      'AWS_S3_BUCKET',
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
    ]

    for (const key of required) {
      if (!env[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when FILE_UPLOAD=aws`,
        })
      }
    }
  })

export type Env = z.infer<typeof envSchema>

/** Validates process.env and exits the process with a readable report on failure. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw)

  if (!result.success) {
    const lines = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
    )
    throw new Error(
      `Invalid environment configuration:\n${lines.join('\n')}\n\n` +
        `Copy .env.example to .env and fill in the missing values.`,
    )
  }

  return result.data
}
