import { Controller, ForbiddenException, Get, Header, Param, Query, Res } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import type { Response } from 'express'
import { Public } from '../common/decorators/public.decorator'
import { LocalDiskStorage } from './local-disk.storage'

/**
 * Serves objects held by the local driver.
 *
 * Marked `@Public` because the signature in the URL is the authorisation: it is
 * HMAC'd with the server key and expires, so it cannot be forged or shared for
 * long. Requiring a session as well would break `<img src>` in the browser,
 * which cannot attach credentials to a cross-origin image request.
 *
 * The S3 driver never reaches this controller; its presigned URLs point
 * straight at the bucket.
 *
 * Excluded from Swagger: the URLs are generated, never called by hand.
 */
@ApiExcludeController()
@Controller('files')
export class FilesController {
  constructor(private readonly local: LocalDiskStorage) {}

  @Public()
  @Get(':key')
  @Header('Cache-Control', 'private, max-age=300')
  // Biometric images must not be indexed or previewed by intermediaries.
  @Header('X-Robots-Tag', 'noindex, nofollow, noarchive')
  async serve(
    @Param('key') key: string,
    @Query('expires') expires: string,
    @Query('signature') signature: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Buffer> {
    const decoded = decodeURIComponent(key)

    if (!this.local.verify(decoded, Number(expires), signature ?? '')) {
      throw new ForbiddenException({
        code: 'INVALID_SIGNATURE',
        message: 'This link is invalid or has expired',
      })
    }

    const body = await this.local.get(decoded)
    res.setHeader('Content-Type', contentTypeFor(decoded))
    return body
  }
}

function contentTypeFor(key: string): string {
  const extension = key.split('.').pop()?.toLowerCase()
  const types: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    svg: 'image/svg+xml',
  }
  // Unknown types are served as a download rather than rendered, so an
  // unexpected upload cannot execute in the browser.
  return types[extension ?? ''] ?? 'application/octet-stream'
}
