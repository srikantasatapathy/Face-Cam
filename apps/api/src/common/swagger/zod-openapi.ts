import { applyDecorators } from '@nestjs/common'
import { ApiBody, ApiQuery } from '@nestjs/swagger'
import type { ZodTypeAny } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'

/**
 * Publishes a Zod schema to Swagger.
 *
 * Validation is done with Zod because member schemas are generated per tenant
 * at runtime, so there are no decorated DTO classes for Swagger to read. Rather
 * than hand-writing a second description of every payload (which would drift
 * from the real rules within a sprint), the documentation is derived from the
 * same schema that does the validating.
 */
function toOpenApi(schema: ZodTypeAny): Record<string, unknown> {
  // The schema argument is widened to ZodTypeAny before the call. zodToJsonSchema
  // is generic over the exact schema shape, and our deeply nested unions push
  // TypeScript past its instantiation depth limit when it tries to infer it.
  // The runtime behaviour is unaffected; only the inference is sidestepped.
  const convert = zodToJsonSchema as unknown as (
    schema: ZodTypeAny,
    options?: Record<string, unknown>,
  ) => Record<string, unknown>

  return convert(schema, {
    // OpenAPI 3.0 does not understand JSON Schema's $ref/definitions layout.
    $refStrategy: 'none',
    target: 'openApi3',
  })
}

/** Documents the request body of a route from its Zod schema. */
export const ApiZodBody = (schema: ZodTypeAny, description?: string) =>
  applyDecorators(ApiBody({ schema: toOpenApi(schema), description }))

/**
 * Documents query parameters from a Zod object schema, one entry per key so
 * Swagger UI renders individual inputs rather than one opaque blob.
 */
export function ApiZodQuery(schema: ZodTypeAny) {
  const json = toOpenApi(schema) as {
    properties?: Record<string, Record<string, unknown>>
    required?: string[]
  }

  const properties = json.properties ?? {}
  const required = new Set(json.required ?? [])

  return applyDecorators(
    ...Object.entries(properties).map(([name, definition]) =>
      ApiQuery({
        name,
        required: required.has(name),
        schema: definition,
        description: definition.description as string | undefined,
      }),
    ),
  )
}
