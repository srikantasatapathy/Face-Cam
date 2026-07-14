import { SetMetadata } from '@nestjs/common'

export const IS_PUBLIC = 'isPublic'

/**
 * Marks a route as reachable without authentication.
 *
 * Authentication is global by default, so a new endpoint is protected unless
 * someone deliberately opens it. Forgetting a decorator then produces a locked
 * endpoint, not an open one.
 */
export const Public = () => SetMetadata(IS_PUBLIC, true)
