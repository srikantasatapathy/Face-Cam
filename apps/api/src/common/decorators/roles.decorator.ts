import { SetMetadata } from '@nestjs/common'
import type { UserRole } from '@facecam/shared'

export const REQUIRED_ROLES = 'requiredRoles'

/** Restricts a route to the listed roles. */
export const Roles = (...roles: UserRole[]) => SetMetadata(REQUIRED_ROLES, roles)
