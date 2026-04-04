import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { AuthModule } from './auth/auth.module'
import { AuditInterceptor } from './common/interceptors/audit.interceptor'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'
import { AuthGuard } from './common/guards/auth.guard'
import { RolesGuard } from './common/guards/roles.guard'
import { TenantStatusGuard } from './common/guards/tenant-status.guard'
import { LoggingInterceptor } from './common/interceptors/logging.interceptor'
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware'
import { AppConfigModule } from './config/config.module'
import { FaceModule } from './face/face.module'
import { HealthModule } from './health/health.module'
import { MembersModule } from './members/members.module'
import { PrismaModule } from './prisma/prisma.module'
import { StorageModule } from './storage/storage.module'
import { TenantsModule } from './tenants/tenants.module'

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    StorageModule,
    AuthModule,
    HealthModule,
    TenantsModule,
    MembersModule,
    FaceModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    // Order matters and is the order listed here:
    //   1. AuthGuard establishes who the caller is and which tenant they act for
    //   2. RolesGuard checks that role may reach this route
    //   3. TenantStatusGuard blocks writes for a suspended tenant
    // Authentication is global, so a new endpoint is protected unless it is
    // explicitly marked @Public().
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: TenantStatusGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Must run before everything else: it opens the AsyncLocalStorage scope
    // that the guards, logging and error handling all depend on.
    consumer.apply(CorrelationIdMiddleware).forRoutes('*')
  }
}
