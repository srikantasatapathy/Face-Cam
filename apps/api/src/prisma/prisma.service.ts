import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { tenantScopeExtension } from './tenant-scope'

export type ScopedPrisma = ReturnType<PrismaService['buildScopedClient']>

/**
 * Two views of the same connection pool:
 *
 *   prisma.db   tenant-scoped. Use this everywhere.
 *   prisma      raw, unscoped. Health checks, migrations, and the Tenant model
 *               itself, which is not owned by any tenant.
 *
 * `db` refuses to touch a tenant-owned table without a tenant in context, so
 * forgetting to scope a query is a loud failure rather than a data leak.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name)
  private scopedClient?: ScopedPrisma

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    })
  }

  async onModuleInit(): Promise<void> {
    await this.$connect()
    this.logger.log('Connected to Postgres')
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
  }

  /** The tenant-scoped client. Built once, then reused. */
  get db(): ScopedPrisma {
    this.scopedClient ??= this.buildScopedClient()
    return this.scopedClient
  }

  private buildScopedClient() {
    return this.$extends(tenantScopeExtension())
  }

  /** Cheap round-trip used by the health check. */
  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`
  }
}
