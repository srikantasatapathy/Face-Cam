import { Controller, Get, Res } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import type { HealthReport } from '@facecam/shared'
import type { Response } from 'express'
import { Public } from '../common/decorators/public.decorator'
import { HealthService } from './health.service'

/**
 * Unauthenticated on purpose. Load balancers, uptime monitors and container
 * orchestrators have no credentials, so a protected health check reports the
 * service as down whenever it is actually up.
 *
 * The payload is deliberately shallow: dependency names and up/down, never
 * connection strings, versions or error internals.
 */
@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Full dependency health report' })
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthReport> {
    const report = await this.health.check()
    // 'degraded' stays 200 so a load balancer does not pull the instance out
    // of rotation just because the face engine is restarting.
    res.status(report.status === 'down' ? 503 : 200)
    return report
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe: is the process running' })
  live(): { status: 'ok' } {
    return { status: 'ok' }
  }
}
