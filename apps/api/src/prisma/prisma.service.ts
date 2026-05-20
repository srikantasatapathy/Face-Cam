import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaClient, type Prisma } from '@prisma/client'
import { AppConfigService } from '../config/app-config.service'
import { RequestContext } from '../common/context/request-context'
import { tenantScopeExtension } from './tenant-scope'

export type ScopedPrisma = ReturnType<PrismaService['buildScopedClient']>

/**
 * Two connections, with different privileges, for different jobs.
 *
 *   prisma.db   Connects as `facecam_app`, a non-owner role that Row Level
 *               Security genuinely binds. Every tenant-scoped query goes here.
 *               Refuses to run without a tenant in context.
 *
 *   prisma      Connects as the owner (a superuser), which Postgres always
 *               exempts from RLS. Reserved for migrations, health checks, the
 *               `Tenant` table itself, and platform-level queries that must
 *               legitimately span every organization.
 *
 * Escalating to platform scope therefore means using a different database
 * connection with different privileges, not flipping a boolean. That is the
 * point: a bug in the application layer cannot grant itself cross-tenant reads.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name)
  private appClient?: PrismaClient
  private scopedClient?: ScopedPrisma

  constructor(private readonly config: AppConfigService) {
    super({
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    })
  }

  async onModuleInit(): Promise<void> {
    await this.$connect()
    await this.db.$connect()

    const bypasses = await this.appRoleBypassesRls()
    if (bypasses) {
      // A superuser or BYPASSRLS role silently turns the second layer off while
      // everything still appears to work. Refuse to start rather than run with
      // one layer that looks like two.
      throw new Error(
        'APP_DATABASE_URL connects as a role that bypasses Row Level Security. ' +
          'Point it at facecam_app (see apps/api/scripts/setup-db-role.sh). ' +
          'Running with this role would disable tenant isolation at the database level.',
      )
    }

    this.logger.log('Connected to Postgres (owner + RLS-bound app role)')
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.$disconnect(), this.appClient?.$disconnect()])
  }

  /** The RLS-bound, tenant-scoped client. Use this for all tenant data. */
  get db(): ScopedPrisma {
    this.scopedClient ??= this.buildScopedClient()
    return this.scopedClient
  }

  /**
   * Runs `fn` inside one transaction with the tenant set, for the rare case
   * where several statements must be atomic.
   *
   * The client handed to `fn` is the raw one, so the tenant filter is NOT
   * injected automatically: every statement inside must set `tenantId` itself.
   * Row Level Security still applies, so a mistake is refused by the database
   * rather than silently writing into another tenant.
   */
  async withTenantTx<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const tenantId = RequestContext.requireTenantId()

    return this.rawAppClient().$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.tenant_id', ${tenantId}::text, true)`
      return fn(tx)
    })
  }

  private rawAppClient(): PrismaClient {
    if (!this.appClient) this.buildScopedClient()
    return this.appClient as PrismaClient
  }

  private buildScopedClient() {
    this.appClient ??= new PrismaClient({
      datasources: { db: { url: this.config.appDatabaseUrl } },
      log: [{ emit: 'event', level: 'error' }],
    })
    return this.appClient.$extends(tenantScopeExtension(this.appClient))
  }

  /** Guards against the app role quietly being given privileges that skip RLS. */
  private async appRoleBypassesRls(): Promise<boolean> {
    const rows = await this.rawAppClient().$queryRaw<Array<{ bypasses: boolean }>>`
      SELECT (rolsuper OR rolbypassrls) AS bypasses
      FROM pg_roles
      WHERE rolname = current_user
    `
    return rows[0]?.bypasses === true
  }

  /** Cheap round-trip used by the health check. */
  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`
  }
}
