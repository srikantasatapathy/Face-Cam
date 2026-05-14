import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express'
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger'
import { CONSENT_VERSION, UserRole, consentSchema } from '@facecam/shared'
import { z } from 'zod'
import { Audited } from '../common/decorators/audited.decorator'
import { Roles } from '../common/decorators/roles.decorator'
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe'
import { ApiZodBody } from '../common/swagger/zod-openapi'
import { EnrolmentService, type EnrolmentResult } from './enrolment.service'
import { FaceDataService, type FaceErasureReport } from './face-data.service'

const withdrawSchema = z.object({
  reason: z.string().trim().max(500).optional(),
})

@ApiTags('face')
@Controller('members/:id')
@ApiCookieAuth('fc_at')
@Roles(UserRole.ORG_ADMIN)
export class FaceController {
  constructor(
    private readonly faces: FaceDataService,
    private readonly enrolment: EnrolmentService,
  ) {}

  @Post('faces')
  @UseInterceptors(FilesInterceptor('images', 8))
  @Audited('member.faces.enrol', 'Member')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Enrol a member face from several captures',
    description:
      'Requires recorded biometric consent; without it this returns 409 and processes nothing. ' +
      'Send between 2 and 8 JPEGs taken at slightly different angles: a single head-on photo ' +
      'enrols cleanly and then fails to match at an angled doorway camera. Partial success is ' +
      'reported rather than rolled back, so three good captures out of four still enrol.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        images: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'No consent recorded, or no face collection provisioned',
  })
  enrol(
    @Param('id') id: string,
    @UploadedFiles() images: Array<{ buffer: Buffer; originalname?: string }> = [],
  ): Promise<EnrolmentResult> {
    return this.enrolment.enrol(id, images)
  }

  @Get('faces')
  @ApiOperation({ summary: 'Enrolled faces for a member, with viewable image links' })
  @ApiParam({ name: 'id', format: 'uuid' })
  listFaces(@Param('id') id: string) {
    return this.faces.listMemberFaces(id)
  }

  @Post('consent')
  @HttpCode(204)
  @Audited('member.consent.record', 'Member')
  @ApiOperation({
    summary: 'Record biometric consent for an existing member',
    description:
      'For members added without consent, typically through a CSV import. No face can be ' +
      'enrolled until this exists.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiZodBody(consentSchema)
  async recordConsent(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(consentSchema)) body: { granted: boolean; version: string },
  ): Promise<void> {
    await this.faces.recordConsent(id, body.version || CONSENT_VERSION)
  }

  @Delete('consent')
  @Audited('member.consent.withdraw', 'Member')
  @ApiOperation({
    summary: 'Withdraw biometric consent and erase all face data',
    description:
      'Withdrawal is not a flag. Keeping face templates after consent is withdrawn would mean ' +
      'processing biometric data with no lawful basis, so this always erases them: from ' +
      'CompreFace, from stored images, and from the database. The member record itself is ' +
      'kept, along with a record that the withdrawal happened.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiZodBody(withdrawSchema)
  @ApiResponse({
    status: 503,
    description: 'The face engine could not be reached, so nothing was erased',
  })
  withdrawConsent(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(withdrawSchema)) body: { reason?: string },
  ): Promise<FaceErasureReport> {
    return this.faces.withdrawConsent(id, body.reason)
  }

  @Delete('faces')
  @Audited('member.faces.erase', 'Member')
  @ApiOperation({
    summary: 'Erase every enrolled face, keeping consent in place',
    description: 'Use before re-enrolling someone whose captures were poor.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  eraseFaces(@Param('id') id: string): Promise<FaceErasureReport> {
    return this.faces.eraseMemberFaces(id)
  }
}
