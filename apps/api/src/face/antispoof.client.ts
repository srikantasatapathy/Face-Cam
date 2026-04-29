import { Injectable, Logger } from '@nestjs/common'
import { AppConfigService } from '../config/app-config.service'

export interface SpoofResult {
  /** Probability the face is a presentation attack. Null when unavailable. */
  score: number | null
  label: 'real' | 'spoof' | 'unknown'
  /** False until real model weights are installed. */
  ready: boolean
}

const UNKNOWN: SpoofResult = { score: null, label: 'unknown', ready: false }

/**
 * Presentation-attack scoring.
 *
 * The service currently ships without model weights and answers `unknown`
 * rather than inventing a number. A failure here never blocks a scan: in
 * log-only mode the score is recorded and nothing is rejected. See
 * docker/antispoof/README.md and PROJECT_DESCRIPTION.md section 7.
 */
@Injectable()
export class AntiSpoofClient {
  private readonly logger = new Logger(AntiSpoofClient.name)

  constructor(private readonly config: AppConfigService) {}

  async score(image: Buffer): Promise<SpoofResult> {
    if (!this.config.antiSpoof.enabled) return UNKNOWN

    try {
      const form = new FormData()
      form.append('file', new Blob([new Uint8Array(image)], { type: 'image/jpeg' }), 'frame.jpg')

      const response = await fetch(`${this.config.antiSpoof.url}/score`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(5000),
      })

      if (!response.ok) return UNKNOWN

      const payload = (await response.json()) as {
        spoofScore: number | null
        label: string
        ready: boolean
      }

      return {
        score: payload.spoofScore,
        label: (payload.label as SpoofResult['label']) ?? 'unknown',
        ready: Boolean(payload.ready),
      }
    } catch (error) {
      // Deliberately swallowed. Anti-spoofing is a signal, not a gate, until
      // enforce mode is switched on with a tuned threshold; a scoring outage
      // must not stop people getting into the building.
      this.logger.warn(`Anti-spoof scoring failed: ${String(error)}`)
      return UNKNOWN
    }
  }

  /** True when the score should be acted on rather than merely recorded. */
  get enforcing(): boolean {
    return this.config.antiSpoof.enabled && this.config.antiSpoof.mode === 'enforce'
  }
}
