import 'reflect-metadata'
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { AppConfigService } from './config/app-config.service'

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap')
  const app = await NestFactory.create(AppModule, { bufferLogs: false })
  const config = app.get(AppConfigService)

  app.setGlobalPrefix('api', { exclude: ['health', 'health/live'] })

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

  if (!config.isProduction) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Face-Cam API')
        .setDescription('Multi-tenant face recognition attendance platform')
        .setVersion('0.1.0')
        .addBearerAuth()
        .build(),
    )
    SwaggerModule.setup('api/docs', app, document)
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
