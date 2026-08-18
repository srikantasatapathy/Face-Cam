import { Global, Module } from '@nestjs/common'
import { ConfigModule as NestConfigModule } from '@nestjs/config'
import { join } from 'node:path'
import { AppConfigService } from './app-config.service'
import { validateEnv } from './env.schema'

/**
 * Loads and validates the environment once, then exposes it as a typed service.
 * Global so no other module needs to import it explicitly.
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // The monorepo keeps a single .env at the repo root, shared by api and web.
      envFilePath: [join(__dirname, '../../../../.env')],
      validate: validateEnv,
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
