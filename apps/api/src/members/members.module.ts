import { Module } from '@nestjs/common'
import { FieldDefinitionsService } from './field-definitions.service'
import { MemberImportService } from './member-import.service'
import { MemberFieldsController, MembersController } from './members.controller'
import { MembersService } from './members.service'

@Module({
  controllers: [MembersController, MemberFieldsController],
  providers: [MembersService, FieldDefinitionsService, MemberImportService],
  exports: [MembersService, FieldDefinitionsService],
})
export class MembersModule {}
