import { Controller, Get, Res } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import type { HealthReport } from '@facecam/shared'
import type { Response } from 'express'
import { HealthService } from './health.service'

@ApiTags('health')
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
