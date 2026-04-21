import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common'
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import {
  AUTH_COOKIE,
  UserRole,
  loginSchema,
  type AccessTokenClaims,
  type LoginInput,
  type LoginResponse,
  type SessionUser,
} from '@facecam/shared'
import type { CookieOptions, Request, Response } from 'express'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { Public } from '../common/decorators/public.decorator'
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe'
import { ApiZodBody } from '../common/swagger/zod-openapi'
import { AppConfigService } from '../config/app-config.service'
import { AuthService } from './auth.service'
import { TokenService } from './token.service'

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Sign in to a tenant portal or the platform console',
    description:
      'Send `tenantSlug` to sign in to an organization portal, or omit it for the platform ' +
      'console. Credentials are confined to one portal: an organization administrator cannot ' +
      'sign in elsewhere. Sets httpOnly access and refresh cookies.',
  })
  @ApiZodBody(loginSchema)
  @ApiResponse({ status: 200, description: 'Signed in; auth cookies set' })
  @ApiResponse({ status: 401, description: 'Wrong credentials, unknown portal, or locked account' })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const { user, accessToken, refreshToken } = await this.auth.login(body)

    this.setAuthCookies(res, accessToken, refreshToken)

    return { user, redirectTo: redirectFor(user) }
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Exchange the refresh cookie for a new token pair',
    description: 'Reads the `fc_rt` cookie. Fails if the user token version has been bumped.',
  })
  @ApiResponse({ status: 401, description: 'Refresh token missing, expired or revoked' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: SessionUser }> {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies
    const token = cookies?.[AUTH_COOKIE.REFRESH] ?? ''

    const { user, accessToken, refreshToken } = await this.auth.refresh(token)
    this.setAuthCookies(res, accessToken, refreshToken)

    return { user }
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Sign out on this device' })
  logout(@Res({ passthrough: true }) res: Response): void {
    this.clearAuthCookies(res)
  }

  @Post('logout-all')
  @HttpCode(204)
  @ApiOperation({ summary: 'Sign out on every device' })
  async logoutEverywhere(
    @CurrentUser() claims: AccessTokenClaims,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logoutEverywhere(claims.sub)
    this.clearAuthCookies(res)
  }

  @Get('me')
  @ApiCookieAuth('fc_at')
  @ApiOperation({ summary: 'The signed-in user' })
  @ApiResponse({ status: 401, description: 'Not signed in' })
  async me(@CurrentUser() claims: AccessTokenClaims): Promise<SessionUser | null> {
    return this.auth.currentUser(claims.sub)
  }

  private baseCookie(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.isProduction,
      // Lax rather than Strict: the API and the portals share a registrable
      // domain, so Lax still covers them, and Strict would drop the cookie on
      // ordinary cross-page navigation into the portal.
      sameSite: 'lax',
    }
  }

  private setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
    res.cookie(AUTH_COOKIE.ACCESS, accessToken, {
      ...this.baseCookie(),
      path: '/',
      maxAge: this.tokens.ttlMs(this.config.auth.accessTtl),
    })

    // Scoped to the auth routes so the long-lived credential is not attached to
    // every ordinary API call.
    res.cookie(AUTH_COOKIE.REFRESH, refreshToken, {
      ...this.baseCookie(),
      path: '/api/auth',
      maxAge: this.tokens.ttlMs(this.config.auth.refreshTtl),
    })
  }

  private clearAuthCookies(res: Response): void {
    res.clearCookie(AUTH_COOKIE.ACCESS, { ...this.baseCookie(), path: '/' })
    res.clearCookie(AUTH_COOKIE.REFRESH, { ...this.baseCookie(), path: '/api/auth' })
  }
}

function redirectFor(user: SessionUser): string {
  if (user.role === UserRole.SUPER_ADMIN) return '/admin'
  if (user.role === UserRole.OPERATOR) return '/kiosk'
  return '/'
}
