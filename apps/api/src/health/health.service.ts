import { Injectable, Logger } from '@nestjs/common'
import type { HealthCheck, HealthReport } from '@facecam/shared'
import Redis from 'ioredis'
import { AppConfigService } from '../config/app-config.service'
import { PrismaService } from '../prisma/prisma.service'

const PROBE_TIMEOUT_MS = 3000

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name)
  private redis?: Redis

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async check(): Promise<HealthReport> {
    const [database, redis, compreface, antispoof] = await Promise.all([
      this.timed('database', () => this.prisma.ping()),
      this.timed('redis', () => this.pingRedis()),
      this.probeHttp(`${this.config.compreface.url}/api/v1/recognition/subjects`, {
        // CompreFace answers 401 without an API key, which still proves it is up.
        acceptStatuses: [200, 400, 401, 403],
      }),
      this.config.antiSpoof.enabled
        ? this.probeHttp(`${this.config.antiSpoof.url}/health`, { acceptStatuses: [200] })
        : Promise.resolve<HealthCheck>({ status: 'disabled' }),
    ])

    const checks = { database, redis, compreface, antispoof }

    // The database being down means the service cannot function at all.
    // A face engine being down degrades attendance capture but leaves the
    // dashboards, reports and admin console fully usable.
    const status: HealthReport['status'] =
      database.status === 'down'
        ? 'down'
        : Object.values(checks).some((check) => check.status === 'down')
          ? 'degraded'
          : 'ok'

    return {
      status,
      uptimeSeconds: Math.floor(process.uptime()),
      version: process.env.npm_package_version ?? '0.1.0',
      checks,
    }
  }

  private async timed(name: string, probe: () => Promise<unknown>): Promise<HealthCheck> {
    const startedAt = Date.now()
    try {
      await this.withTimeout(probe())
      return { status: 'up', latencyMs: Date.now() - startedAt }
    } catch (error) {
      this.logger.warn(`Health probe "${name}" failed: ${this.describe(error)}`)
      return { status: 'down', latencyMs: Date.now() - startedAt, message: this.describe(error) }
    }
  }

  private async probeHttp(
    url: string,
    options: { acceptStatuses: number[] },
  ): Promise<HealthCheck> {
    const startedAt = Date.now()
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      })
      const latencyMs = Date.now() - startedAt

      if (!options.acceptStatuses.includes(response.status)) {
        return { status: 'down', latencyMs, message: `Unexpected status ${response.status}` }
      }
      return { status: 'up', latencyMs }
    } catch (error) {
      return {
        status: 'down',
        latencyMs: Date.now() - startedAt,
        message: this.describe(error),
      }
    }
  }

  private async pingRedis(): Promise<void> {
    this.redis ??= new Redis(this.config.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      // Without this, a down Redis makes the health endpoint hang on reconnects.
      retryStrategy: () => null,
    })
    await this.redis.ping()
  }

  private withTimeout<T>(promise: Promise<T>): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Timed out after ${PROBE_TIMEOUT_MS}ms`)),
          PROBE_TIMEOUT_MS,
        ),
      ),
    ])
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}
