import { Module } from '@nestjs/common'
import { EncryptionService } from '../common/crypto/encryption.service'
import { AntiSpoofClient } from './antispoof.client'
import { ComprefaceClient } from './compreface.client'
import { EnrolmentService } from './enrolment.service'
import { FaceController } from './face.controller'
import { FaceDataService } from './face-data.service'

@Module({
  controllers: [FaceController],
  providers: [
    ComprefaceClient,
    AntiSpoofClient,
    FaceDataService,
    EnrolmentService,
    EncryptionService,
  ],
  exports: [ComprefaceClient, FaceDataService, EnrolmentService],
})
export class FaceModule {}
