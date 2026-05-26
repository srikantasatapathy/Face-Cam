import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { AppConfigService } from '../config/app-config.service'
import type { StorageService, StoredObject } from './storage.interface'

/**
 * S3-compatible storage. Works unchanged against AWS S3, Cloudflare R2 and a
 * self-hosted MinIO, which is the intended migration path from local disk.
 *
 * The bucket must be private. Access is always through a presigned URL issued
 * by an authorised request; nothing here makes an object publicly readable.
 */
@Injectable()
export class S3Storage implements StorageService {
  private readonly logger = new Logger(S3Storage.name)
  private readonly client: S3Client
  private readonly bucket: string

  constructor(private readonly config: AppConfigService) {
    const aws = this.config.storage.aws
    this.bucket = aws.bucket as string

    this.client = new S3Client({
      region: aws.region,
      credentials: {
        accessKeyId: aws.accessKeyId as string,
        secretAccessKey: aws.secretAccessKey as string,
      },
      // Set when pointing at MinIO or R2 rather than AWS.
      ...(aws.endpoint ? { endpoint: aws.endpoint, forcePathStyle: true } : {}),
    })
  }

  async put(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Defence in depth: even if the bucket policy is wrong, the object is not public.
        ACL: 'private',
      }),
    )
    return { key, size: body.byteLength, contentType }
  }

  async get(key: string): Promise<Buffer> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      )
      const bytes = await response.Body?.transformToByteArray()
      if (!bytes) throw new Error('Empty body')
      return Buffer.from(bytes)
    } catch {
      throw new NotFoundException({ code: 'OBJECT_NOT_FOUND', message: 'File not found' })
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))
      return true
    } catch {
      return false
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }

  /** Paginates: a tenant with years of snapshots exceeds the 1000-key page. */
  async deletePrefix(prefix: string): Promise<number> {
    let removed = 0
    let token: string | undefined

    do {
      const listed = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: token,
        }),
      )

      const keys = (listed.Contents ?? [])
        .map((object) => object.Key)
        .filter((key): key is string => Boolean(key))

      if (keys.length > 0) {
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: keys.map((Key) => ({ Key })) },
          }),
        )
        removed += keys.length
      }

      token = listed.IsTruncated ? listed.NextContinuationToken : undefined
    } while (token)

    return removed
  }

  async signedUrl(key: string, ttlSeconds?: number): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: ttlSeconds ?? this.config.storage.signedUrlTtl,
    })
  }

  describe() {
    return { driver: 'aws', location: `s3://${this.bucket}` }
  }
}
