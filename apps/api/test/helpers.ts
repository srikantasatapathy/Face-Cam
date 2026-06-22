import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { UserRole } from '@facecam/shared'
import cookieParser from 'cookie-parser'
import { randomUUID } from 'node:crypto'
import { AppModule } from '../src/app.module'
import { AuthService } from '../src/auth/auth.service'
import { PrismaService } from '../src/prisma/prisma.service'

export interface TestContext {
  app: INestApplication
  prisma: PrismaService
}

export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()

  const app = moduleRef.createNestApplication()
  app.setGlobalPrefix('api', { exclude: ['health', 'health/live'] })
  app.use(cookieParser())
  await app.init()

  return { app, prisma: app.get(PrismaService) }
}

/** A slug unique to this run, so parallel or repeated runs never collide. */
export function uniqueSlug(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`
}

export async function seedSuperAdmin(prisma: PrismaService, password: string) {
  const email = `super-${randomUUID().slice(0, 8)}@facecam.test`
  return prisma.user.create({
    data: {
      email,
      passwordHash: await AuthService.hashPassword(password),
      fullName: 'Test Super Admin',
      role: UserRole.SUPER_ADMIN,
      tenantId: null,
    },
  })
}

/** Extracts the access-token cookie from a Set-Cookie header for reuse. */
export function cookiesFrom(headers: Record<string, unknown>): string {
  const raw = headers['set-cookie']
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : []
  return list.map((entry) => String(entry).split(';')[0]).join('; ')
}
