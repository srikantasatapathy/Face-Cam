import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { AppConfigService } from '../config/app-config.service'

/**
 * Thin client over CompreFace.
 *
 * Two distinct surfaces, with different authentication:
 *
 *   Admin API   OAuth2 password grant -> bearer token. Used to create the face
 *               collection each tenant gets, which is what stops one school's
 *               faces being match candidates for another's.
 *
 *   Recognition Per-collection `x-api-key`. Used for everything else: adding
 *               faces, recognising, deleting.
 *
 * Every method throws ServiceUnavailableException on transport failure rather
 * than returning a falsy value, so a CompreFace outage can never be mistaken
 * for "no match found".
 */

export interface ComprefaceCollection {
  applicationId: string
  apiKey: string
}

export interface AddFaceResult {
  imageId: string
  subject: string
}

export interface RecognitionMatch {
  subject: string
  similarity: number
}

export interface RecognitionResult {
  /** Empty when a face was detected but matched nobody above the threshold. */
  matches: RecognitionMatch[]
  /** Number of faces found in the frame. Anything but 1 is rejected upstream. */
  facesDetected: number
  detectionScore?: number
  embedding?: number[]
}

const REQUEST_TIMEOUT_MS = 20_000

@Injectable()
export class ComprefaceClient {
  private readonly logger = new Logger(ComprefaceClient.name)
  private session?: { cookie: string; expiresAt: number }

  constructor(private readonly config: AppConfigService) {}

  get isAdminConfigured(): boolean {
    return this.config.comprefaceAdminConfigured
  }

  // -------------------------------------------------------------------------
  // Admin API
  // -------------------------------------------------------------------------

  /**
   * Creates an application and a recognition collection for one tenant, and
   * returns the API key scoped to it.
   *
   * The caller stores that key encrypted against the tenant. Every later
   * recognition call is confined to this collection, which is the isolation
   * boundary for face data.
   */
  async createTenantCollection(name: string): Promise<ComprefaceCollection> {
    const session = await this.adminSession()

    const app = await this.adminRequest<{ id: string }>('/admin/app', session, {
      method: 'POST',
      body: JSON.stringify({ name }),
    })

    const model = await this.adminRequest<{ apiKey: string }>(
      `/admin/app/${app.id}/model`,
      session,
      { method: 'POST', body: JSON.stringify({ name, type: 'RECOGNITION' }) },
    )

    this.logger.log(`Provisioned CompreFace collection "${name}" (app ${app.id})`)
    return { applicationId: app.id, apiKey: model.apiKey }
  }

  /** Removes a tenant's application and every face inside it. */
  async deleteTenantCollection(applicationId: string): Promise<void> {
    const session = await this.adminSession()
    await this.adminRequest(`/admin/app/${applicationId}`, session, { method: 'DELETE' })
    this.logger.log(`Deleted CompreFace application ${applicationId}`)
  }

  /**
   * Signs in and returns the admin session cookie.
   *
   * CompreFace's token endpoint answers with an OAuth2-shaped body containing
   * an `access_token`, but that token is NOT what authorises admin calls:
   * presenting it as a bearer token is rejected with "Failed to find access
   * token". The real credential is the httpOnly `CFSESSION` cookie set on the
   * same response. Establishing that took some digging, hence this note.
   *
   * Cached until shortly before expiry so tenant creation does not pay for a
   * fresh login every time.
   */
  private async adminSession(): Promise<string> {
    if (this.session && this.session.expiresAt > Date.now()) return this.session.cookie

    const { url, adminEmail, adminPassword, clientId, clientSecret } = this.config.compreface

    if (!adminEmail || !adminPassword) {
      throw new ServiceUnavailableException({
        code: 'COMPREFACE_NOT_CONFIGURED',
        message:
          'CompreFace admin credentials are not set. Provisioning a face collection needs ' +
          'COMPREFACE_ADMIN_EMAIL and COMPREFACE_ADMIN_PASSWORD.',
      })
    }

    const body = new URLSearchParams({
      grant_type: 'password',
      username: adminEmail,
      password: adminPassword,
    })

    const response = await this.fetchWithTimeout(`${url}/admin/oauth/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    })

    if (!response.ok) {
      throw new ServiceUnavailableException({
        code: 'COMPREFACE_AUTH_FAILED',
        message: `CompreFace rejected the admin credentials (HTTP ${response.status}).`,
      })
    }

    const payload = (await response.json()) as { expires_in?: number }
    const cookie = extractCookie(response.headers, 'CFSESSION')

    if (!cookie) {
      throw new ServiceUnavailableException({
        code: 'COMPREFACE_AUTH_FAILED',
        message:
          'CompreFace signed in but returned no CFSESSION cookie, which is what authorises ' +
          'admin calls. The CompreFace version may have changed its auth scheme.',
      })
    }

    // Refresh a minute early so a session cannot expire mid-request.
    this.session = {
      cookie,
      expiresAt: Date.now() + Math.max(0, (payload.expires_in ?? 2400) - 60) * 1000,
    }

    return this.session.cookie
  }

  private async adminRequest<T>(path: string, session: string, init: RequestInit): Promise<T> {
    const response = await this.fetchWithTimeout(`${this.config.compreface.url}${path}`, {
      ...init,
      headers: {
        Cookie: `CFSESSION=${session}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new ServiceUnavailableException({
        code: 'COMPREFACE_ADMIN_ERROR',
        message: `CompreFace admin call failed: ${response.status} ${detail.slice(0, 200)}`,
      })
    }

    // DELETE returns an empty body.
    const text = await response.text()
    return (text ? JSON.parse(text) : {}) as T
  }

  // -------------------------------------------------------------------------
  // Recognition API
  // -------------------------------------------------------------------------

  /** Adds one face image to a subject, creating the subject if needed. */
  async addFace(
    apiKey: string,
    subject: string,
    image: Buffer,
    filename = 'face.jpg',
  ): Promise<AddFaceResult> {
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(image)], { type: 'image/jpeg' }), filename)

    const payload = await this.recognitionRequest<{ image_id: string; subject: string }>(
      `/api/v1/recognition/faces?subject=${encodeURIComponent(subject)}&det_prob_threshold=0.8`,
      apiKey,
      { method: 'POST', body: form },
    )

    return { imageId: payload.image_id, subject: payload.subject }
  }

  /** Removes one enrolled image. Used when re-enrolling a single bad capture. */
  async deleteFace(apiKey: string, imageId: string): Promise<void> {
    await this.recognitionRequest(`/api/v1/recognition/faces/${imageId}`, apiKey, {
      method: 'DELETE',
    })
  }

  /**
   * Removes every face for a subject.
   *
   * This is the call that makes a consent withdrawal real on the CompreFace
   * side. It must succeed, or the withdrawal has not actually happened.
   */
  async deleteSubject(apiKey: string, subject: string): Promise<void> {
    await this.recognitionRequest(
      `/api/v1/recognition/subjects/${encodeURIComponent(subject)}`,
      apiKey,
      { method: 'DELETE' },
    )
  }

  async listSubjects(apiKey: string): Promise<string[]> {
    const payload = await this.recognitionRequest<{ subjects: string[] }>(
      '/api/v1/recognition/subjects',
      apiKey,
      { method: 'GET' },
    )
    return payload.subjects ?? []
  }

  /**
   * Matches a frame against the tenant's collection.
   *
   * `facesDetected` is returned separately from the matches because zero faces,
   * several faces, and one unrecognised face are three different problems and
   * the kiosk should say something different for each.
   */
  async recognize(apiKey: string, image: Buffer, limit = 1): Promise<RecognitionResult> {
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(image)], { type: 'image/jpeg' }), 'frame.jpg')

    const payload = await this.recognitionRequest<{
      result?: Array<{
        box?: { probability?: number }
        subjects?: Array<{ subject: string; similarity: number }>
        embedding?: number[]
      }>
    }>(
      `/api/v1/recognition/recognize?limit=${limit}&det_prob_threshold=0.8&face_plugins=calculator`,
      apiKey,
      { method: 'POST', body: form },
    )

    const faces = payload.result ?? []
    const first = faces[0]

    return {
      facesDetected: faces.length,
      matches: (first?.subjects ?? []).map((match) => ({
        subject: match.subject,
        similarity: match.similarity,
      })),
      detectionScore: first?.box?.probability,
      embedding: first?.embedding,
    }
  }

  /** True when CompreFace answers at all. Used by the health check. */
  async ping(apiKey?: string): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout(
        `${this.config.compreface.url}/api/v1/recognition/subjects`,
        { headers: apiKey ? { 'x-api-key': apiKey } : {} },
      )
      // 401 without a key still proves the service is up.
      return [200, 400, 401, 403].includes(response.status)
    } catch {
      return false
    }
  }

  private async recognitionRequest<T>(path: string, apiKey: string, init: RequestInit): Promise<T> {
    const response = await this.fetchWithTimeout(`${this.config.compreface.url}${path}`, {
      ...init,
      headers: { 'x-api-key': apiKey, ...init.headers },
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new ServiceUnavailableException({
        code: 'COMPREFACE_ERROR',
        message: `CompreFace call failed: ${response.status} ${detail.slice(0, 200)}`,
      })
    }

    const text = await response.text()
    return (text ? JSON.parse(text) : {}) as T
  }

  /**
   * A hung face engine must not hang the request. Without a timeout a stalled
   * CompreFace would hold the kiosk's connection open until the browser gave
   * up, with no error to show the person standing at the door.
   */
  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    } catch (error) {
      throw new ServiceUnavailableException({
        code: 'COMPREFACE_UNREACHABLE',
        message: `Could not reach the face engine: ${
          error instanceof Error ? error.message : String(error)
        }`,
      })
    }
  }
}

/** Pulls one cookie value out of a Set-Cookie response header. */
function extractCookie(headers: Headers, name: string): string | null {
  const raw = headers.getSetCookie?.() ?? []
  const all = raw.length > 0 ? raw : [headers.get('set-cookie') ?? '']

  for (const entry of all) {
    const match = new RegExp(`(?:^|,\\s*)${name}=([^;]+)`).exec(entry)
    if (match?.[1]) return match[1]
  }
  return null
}
