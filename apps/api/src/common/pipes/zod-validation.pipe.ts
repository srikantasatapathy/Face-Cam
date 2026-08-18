import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common'
import type { ZodTypeAny, z } from 'zod'

/**
 * Validates and transforms a handler argument with a Zod schema.
 *
 * Zod is used rather than class-validator because member validation is built at
 * runtime from each tenant's field definitions (see @facecam/shared
 * `buildMemberSchema`), and the web app runs the identical schema on the form.
 * A second, decorator-based validation system would inevitably drift from it.
 *
 * ZodErrors are converted to the standard error envelope by AllExceptionsFilter.
 *
 * Usage:
 *   @Post()
 *   create(@Body(new ZodValidationPipe(createTenantSchema)) dto: CreateTenantDto) {}
 */
@Injectable()
export class ZodValidationPipe<T extends ZodTypeAny> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown, _metadata: ArgumentMetadata): z.infer<T> {
    return this.schema.parse(value)
  }
}

/** Convenience factory so call sites read as `zodBody(schema)`. */
export function zodPipe<T extends ZodTypeAny>(schema: T): ZodValidationPipe<T> {
  return new ZodValidationPipe(schema)
}
