import 'reflect-metadata'
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { AppConfigService } from './config/app-config.service'

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap')
  const app = await NestFactory.create(AppModule, { bufferLogs: false })
  const config = app.get(AppConfigService)

  app.setGlobalPrefix('api', { exclude: ['health', 'health/live'] })

  // Auth tokens travel as httpOnly cookies, so they must be parsed before the
  // global AuthGuard runs.
  app.use(cookieParser())

  app.use(
    helmet({
      // Images are served from the API under signed URLs and rendered by the
      // web app on a different origin, so the default same-origin policy blocks them.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  )

  // Wildcard subdomains all resolve to the same web origin, so the allowlist is
  // built from the root domain rather than from a fixed list of hosts.
  const rootDomain = config.rootDomain.split(':')[0]
  app.enableCors({
    credentials: true,
    origin: (origin, callback) => {
      if (!origin) return callback(null, true) // same-origin, curl, health checks
      try {
        const hostname = new URL(origin).hostname
        const allowed = hostname === rootDomain || hostname.endsWith(`.${rootDomain}`)
        return callback(null, allowed)
      } catch {
        return callback(null, false)
      }
    },
  })

  // No global validation pipe: request bodies are validated per-route with
  // ZodValidationPipe, because member schemas are generated at runtime from
  // each tenant's field definitions. See common/pipes/zod-validation.pipe.ts.

  // Never exposed in production: the spec is a map of every endpoint, and this
  // API handles biometric data.
  if (!config.isProduction) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Face-Cam API')
        .setDescription(
          [
            'Multi-tenant face recognition attendance platform.',
            '',
            '### Signing in',
            'Call `POST /api/auth/login`. Auth travels as httpOnly cookies, which Swagger UI',
            'sends automatically once you have logged in, so there is no token to paste.',
            '',
            '- Platform console: omit `tenantSlug`.',
            '- Organization portal: send the `tenantSlug`.',
            '',
            'Credentials are confined to one portal. An organization administrator cannot sign',
            'in to another organization or to the platform console.',
            '',
            '### Tenant scoping',
            'The tenant is taken from the signed token, never from the hostname or a header.',
            'Rows belonging to another organization read as "not found" rather than',
            '"forbidden", because a 403 would confirm the record exists.',
            '',
            '### Request schemas',
            'Generated from the same Zod schemas that perform validation, so the documentation',
            'cannot drift from the rules actually enforced.',
          ].join('\n'),
        )
        .setVersion('0.1.0')
        .addCookieAuth('fc_at', { type: 'apiKey', in: 'cookie', name: 'fc_at' })
        .addBearerAuth({ type: 'http', scheme: 'bearer' })
        .addTag('auth', 'Sign in, refresh, sign out')
        .addTag('admin/tenants', 'Platform console. Super admin only.')
        .addTag('public', 'Unauthenticated endpoints')
        .addTag('health', 'Dependency health')
        .build(),
    )

    SwaggerModule.setup('api/docs', app, document, {
      customSiteTitle: 'Face-Cam API',
      swaggerOptions: {
        // Send cookies with try-it-out requests, otherwise every authenticated
        // call from the UI returns 401.
        withCredentials: true,
        persistAuthorization: true,
        docExpansion: 'list',
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
    })

    logger.log(`Swagger UI at http://localhost:${config.apiPort}/api/docs`)
  }

  app.enableShutdownHooks()

  await app.listen(config.apiPort)
  logger.log(`API listening on http://localhost:${config.apiPort} (${config.nodeEnv})`)
  logger.log(`Storage driver: ${config.storage.driver}`)
  logger.log(`Anti-spoof: ${config.antiSpoof.enabled ? config.antiSpoof.mode : 'disabled'}`)
}

bootstrap().catch((error) => {
  // Config validation failures land here. Print the readable report, not a stack.
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`\nFailed to start API:\n${message}\n\n`)
  process.exit(1)
})
