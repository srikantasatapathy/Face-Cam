import { Module } from '@nestjs/common'
import { EncryptionService } from '../common/crypto/encryption.service'
import { AdminTenantsController, PublicTenantsController } from './tenants.controller'
import { TenantsService } from './tenants.service'

@Module({
  controllers: [AdminTenantsController, PublicTenantsController],
  providers: [TenantsService, EncryptionService],
  exports: [TenantsService, EncryptionService],
})
export class TenantsModule {}
