import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import { ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger'
import {
  UserRole,
  createFieldDefinitionSchema,
  importMembersSchema,
  listMembersSchema,
  reorderFieldDefinitionsSchema,
  updateFieldDefinitionSchema,
  type CreateFieldDefinitionInput,
  type FieldDefinitionDto,
  type ImportMembersInput,
  type ImportReport,
  type ListMembersQuery,
  type MemberDto,
  type Paginated,
  type ReorderFieldDefinitionsInput,
  type UpdateFieldDefinitionInput,
} from '@facecam/shared'
import { Audited } from '../common/decorators/audited.decorator'
import { Roles } from '../common/decorators/roles.decorator'
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe'
import { ApiZodBody, ApiZodQuery } from '../common/swagger/zod-openapi'
import { FieldDefinitionsService } from './field-definitions.service'
import { MemberImportService } from './member-import.service'
import { MembersService } from './members.service'

@ApiTags('members')
@Controller('members')
@ApiCookieAuth('fc_at')
@Roles(UserRole.ORG_ADMIN, UserRole.OPERATOR)
export class MembersController {
  constructor(
    private readonly members: MembersService,
    private readonly imports: MemberImportService,
    private readonly fields: FieldDefinitionsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List members' })
  @ApiZodQuery(listMembersSchema)
  list(
    @Query(new ZodValidationPipe(listMembersSchema)) query: ListMembersQuery,
  ): Promise<Paginated<MemberDto>> {
    return this.members.list(query)
  }

  @Get('export.csv')
  @Roles(UserRole.ORG_ADMIN)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="members.csv"')
  @ApiOperation({ summary: 'Export members as CSV' })
  async exportCsv(): Promise<string> {
    const [members, definitions] = await Promise.all([this.members.exportAll(), this.fields.list()])
    return toCsv(members, definitions)
  }

  @Get(':id')
  @ApiOperation({ summary: 'One member' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 404, description: 'No such member' })
  findOne(@Param('id') id: string): Promise<MemberDto> {
    return this.members.findById(id)
  }

  @Post()
  @Roles(UserRole.ORG_ADMIN)
  @Audited('member.create', 'Member')
  @ApiOperation({
    summary: 'Create a member',
    description:
      'Validated against the current field definitions for this organization, so the accepted ' +
      'shape differs per tenant. Send `consent: { granted, version }` to record biometric ' +
      'consent at the same time; without it the member exists but cannot be face-enrolled.',
  })
  @ApiResponse({ status: 409, description: 'Member code already in use' })
  @ApiResponse({ status: 422, description: 'Validation failed; see `details`' })
  async create(@Body() body: unknown): Promise<MemberDto> {
    return this.members.create(await this.members.validate(body))
  }

  @Patch(':id')
  @Roles(UserRole.ORG_ADMIN)
  @Audited('member.update', 'Member')
  @ApiOperation({ summary: 'Update a member' })
  @ApiParam({ name: 'id', format: 'uuid' })
  async update(@Param('id') id: string, @Body() body: unknown): Promise<MemberDto> {
    return this.members.update(id, await this.members.validate(body))
  }

  @Delete(':id')
  @Roles(UserRole.ORG_ADMIN)
  @Audited('member.archive', 'Member')
  @ApiOperation({
    summary: 'Archive a member',
    description:
      'Soft delete. Attendance history is preserved, because a report for an earlier month ' +
      'must still show who was enrolled then.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  archive(@Param('id') id: string): Promise<MemberDto> {
    return this.members.archive(id)
  }

  @Post(':id/restore')
  @Roles(UserRole.ORG_ADMIN)
  @Audited('member.restore', 'Member')
  @ApiOperation({ summary: 'Restore an archived member' })
  @ApiParam({ name: 'id', format: 'uuid' })
  restore(@Param('id') id: string): Promise<MemberDto> {
    return this.members.restore(id)
  }

  @Post('import')
  @Roles(UserRole.ORG_ADMIN)
  @HttpCode(200)
  @Audited('member.import', 'Member')
  @ApiOperation({
    summary: 'Import members from parsed CSV rows',
    description:
      'Defaults to a dry run that validates every row and returns the full error report ' +
      'without writing anything. A real run is all-or-nothing: if any row fails, nothing is ' +
      'written, so an organization is never left reconciling a half-finished import.',
  })
  @ApiZodBody(importMembersSchema)
  import(
    @Body(new ZodValidationPipe(importMembersSchema)) body: ImportMembersInput,
  ): Promise<ImportReport> {
    return this.imports.run(body)
  }
}

@ApiTags('members')
@Controller('member-fields')
@ApiCookieAuth('fc_at')
@Roles(UserRole.ORG_ADMIN, UserRole.OPERATOR)
export class MemberFieldsController {
  constructor(private readonly fields: FieldDefinitionsService) {}

  @Get()
  @ApiOperation({
    summary: "This organization's member fields, in display order",
    description:
      'Drives both the enrolment form and API validation. The web app builds its form and ' +
      'its client-side schema from this same response.',
  })
  list(@Query('includeArchived') includeArchived?: string): Promise<FieldDefinitionDto[]> {
    return this.fields.list(includeArchived === 'true')
  }

  @Post()
  @Roles(UserRole.ORG_ADMIN)
  @Audited('memberField.create', 'MemberFieldDefinition')
  @ApiOperation({ summary: 'Add a field' })
  @ApiZodBody(createFieldDefinitionSchema)
  @ApiResponse({ status: 409, description: 'Key already used by an active or archived field' })
  create(
    @Body(new ZodValidationPipe(createFieldDefinitionSchema)) body: CreateFieldDefinitionInput,
  ): Promise<FieldDefinitionDto> {
    return this.fields.create(body)
  }

  @Patch('reorder')
  @Roles(UserRole.ORG_ADMIN)
  @Audited('memberField.reorder', 'MemberFieldDefinition')
  @ApiOperation({ summary: 'Set the display order' })
  @ApiZodBody(reorderFieldDefinitionsSchema)
  reorder(
    @Body(new ZodValidationPipe(reorderFieldDefinitionsSchema))
    body: ReorderFieldDefinitionsInput,
  ): Promise<FieldDefinitionDto[]> {
    return this.fields.reorder(body)
  }

  @Patch(':id')
  @Roles(UserRole.ORG_ADMIN)
  @Audited('memberField.update', 'MemberFieldDefinition')
  @ApiOperation({
    summary: 'Update a field',
    description: 'Key and type cannot change: both would invalidate data already stored.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiZodBody(updateFieldDefinitionSchema)
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateFieldDefinitionSchema)) body: UpdateFieldDefinitionInput,
  ): Promise<FieldDefinitionDto> {
    return this.fields.update(id, body)
  }

  @Delete(':id')
  @Roles(UserRole.ORG_ADMIN)
  @Audited('memberField.archive', 'MemberFieldDefinition')
  @ApiOperation({
    summary: 'Archive a field',
    description:
      'The field leaves forms and validation, but values already stored under its key are ' +
      'kept, so restoring it brings the data back rather than an empty column.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  archive(@Param('id') id: string): Promise<FieldDefinitionDto> {
    return this.fields.archive(id)
  }

  @Post(':id/restore')
  @Roles(UserRole.ORG_ADMIN)
  @Audited('memberField.restore', 'MemberFieldDefinition')
  @ApiOperation({ summary: 'Restore an archived field' })
  @ApiParam({ name: 'id', format: 'uuid' })
  restore(@Param('id') id: string): Promise<FieldDefinitionDto> {
    return this.fields.restore(id)
  }
}

/** RFC 4180 quoting: wrap in quotes and double any embedded quote. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function toCsv(members: MemberDto[], definitions: FieldDefinitionDto[]): string {
  const dynamic = definitions.filter((definition) => definition.archivedAt === null)
  const header = [
    'code',
    'fullName',
    'email',
    'phone',
    'status',
    ...dynamic.map((definition) => definition.key),
    'consentAt',
    'faceEnrolledAt',
  ]

  const lines = members.map((member) =>
    [
      member.code,
      member.fullName,
      member.email,
      member.phone,
      member.status,
      ...dynamic.map((definition) => member.attributes[definition.key]),
      member.consentAt,
      member.faceEnrolledAt,
    ]
      .map(csvCell)
      .join(','),
  )

  // Excel opens UTF-8 CSV as the local codepage unless a BOM is present, which
  // mangles non-ASCII names. Schools export these constantly.
  return '﻿' + [header.join(','), ...lines].join('\r\n') + '\r\n'
}
