/**
 * Points the tests at a dedicated database.
 *
 * This runs before anything imports PrismaClient, so the connection string is
 * already overridden by the time the client is constructed. Tests create and
 * suspend organizations, so they must never share the development database.
 */
import { config } from 'dotenv'
import { resolve } from 'node:path'

config({ path: resolve(__dirname, '../../../.env') })

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://user:password@localhost:5436/facecam_test_db'

process.env.NODE_ENV = 'test'
