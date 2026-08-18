import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'
import { LoggingInterceptor } from './common/interceptors/logging.interceptor'
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware'
import { AppConfigModule } from './config/config.module'
import { HealthModule } from './health/health.module'
import { PrismaModule } from './prisma/prisma.module'

@Module({
  imports: [AppConfigModule, PrismaModule, HealthModule],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Must run before everything else: it opens the AsyncLocalStorage scope
    // that the tenant middleware, logging and error handling all depend on.
    consumer.apply(CorrelationIdMiddleware).forRoutes('*')
  }
}
