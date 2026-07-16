import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { AccessTokenClaims } from '@facecam/shared'

/** Injects the verified token claims of the caller. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AccessTokenClaims => {
    return context.switchToHttp().getRequest().user
  },
)
