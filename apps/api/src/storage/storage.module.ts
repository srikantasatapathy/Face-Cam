import { Global, Logger, Module } from '@nestjs/common'
import { AppConfigService } from '../config/app-config.service'
import { FilesController } from './files.controller'
import { LocalDiskStorage } from './local-disk.storage'
import { S3Storage } from './s3.storage'
import { STORAGE_SERVICE, type StorageService } from './storage.interface'

/**
 * Picks the storage backend at boot from `FILE_UPLOAD`.
 *
 * The environment schema already refuses to start with `FILE_UPLOAD=aws` and
 * missing credentials, so a misconfigured deployment fails immediately rather
 * than on the first face upload.
 */
@Global()
@Module({
  controllers: [FilesController],
  providers: [
    LocalDiskStorage,
    {
      provide: STORAGE_SERVICE,
      inject: [AppConfigService, LocalDiskStorage],
      useFactory: (config: AppConfigService, local: LocalDiskStorage): StorageService => {
        const driver = config.storage.driver
        const service: StorageService = driver === 'aws' ? new S3Storage(config) : local

        const described = service.describe()
        new Logger('StorageModule').log(
          `Storage driver: ${described.driver} (${described.location})`,
        )
        return service
      },
    },
  ],
  exports: [STORAGE_SERVICE, LocalDiskStorage],
})
export class StorageModule {}
