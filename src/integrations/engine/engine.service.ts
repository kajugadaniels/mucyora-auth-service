import { createHash, createHmac, randomUUID } from 'node:crypto';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import Joi from 'joi';
import { firstValueFrom } from 'rxjs';

import { AuthEnvironment } from '../../config/environment.validation';
import {
  EngineInvalidResponseError,
  EngineUnavailableError,
} from './engine.errors';

interface EngineLivenessSession {
  sessionId: string;
  expiresAt: string;
}

const livenessSchema = Joi.object<EngineLivenessSession>({
  sessionId: Joi.string().max(200).required(),
  expiresAt: Joi.string().isoDate().required(),
}).unknown(false);

const evaluationSchema = Joi.object<EngineEvaluation>({
  decision: Joi.string()
    .valid(
      'PASS',
      'FAIL',
      'RETRY',
      'MANUAL_REVIEW',
      'PROVIDER_UNAVAILABLE',
      'INVALID_REQUEST',
    )
    .required(),
  policyVersion: Joi.string().max(64).required(),
  faceSimilarity: Joi.number().min(0).max(100),
  livenessConfidence: Joi.number().min(0).max(100),
  compositeScore: Joi.number().min(0).max(100),
  documentBindingVerified: Joi.boolean().required(),
  reasonCode: Joi.string().max(64).required(),
  evaluatedAt: Joi.string().isoDate().required(),
}).unknown(false);

export interface EngineEvaluation {
  decision:
    | 'PASS'
    | 'FAIL'
    | 'RETRY'
    | 'MANUAL_REVIEW'
    | 'PROVIDER_UNAVAILABLE'
    | 'INVALID_REQUEST';
  policyVersion: string;
  faceSimilarity?: number;
  livenessConfidence?: number;
  compositeScore?: number;
  documentBindingVerified: boolean;
  reasonCode: string;
  evaluatedAt: string;
}

@Injectable()
export class EngineService {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService<AuthEnvironment, true>,
  ) {}

  async createLivenessSession(input: {
    requestId: string;
    attemptId: string;
    userId: string;
    policyVersion: string;
  }): Promise<{ sessionId: string; expiresAt: string }> {
    return this.request<{ sessionId: string; expiresAt: string }>(
      '/api/v1/liveness/sessions',
      input,
      livenessSchema,
    );
  }

  async evaluate(input: {
    requestId: string;
    attemptId: string;
    userId: string;
    idDocumentReference: string;
    livenessSessionId: string;
    documentBindingVerified: true;
    policyVersion: string;
    idempotencyKey: string;
  }): Promise<EngineEvaluation> {
    return this.request<EngineEvaluation>(
      '/api/v1/verifications/evaluate',
      input,
      evaluationSchema,
    );
  }

  private async request<T>(
    path: string,
    body: Record<string, unknown>,
    schema: Joi.ObjectSchema<T>,
  ): Promise<T> {
    await this.acquire();
    const serialized = JSON.stringify(body);
    const timestamp = new Date().toISOString();
    const nonce = randomUUID();
    const bodyDigest = createHash('sha256')
      .update(serialized)
      .digest('base64url');
    const signature = createHmac(
      'sha256',
      this.config.get('MUCYORA_ENGINE_SERVICE_KEY', { infer: true }),
    )
      .update(
        [
          'POST',
          path,
          'mucyora-auth',
          'mucyora-engine',
          timestamp,
          nonce,
          bodyDigest,
        ].join('\n'),
      )
      .digest('base64url');

    try {
      const response = await firstValueFrom(
        this.http.post(path, serialized, {
          headers: {
            'content-type': 'application/json',
            'x-mucyora-caller': 'mucyora-auth',
            'x-mucyora-audience': 'mucyora-engine',
            'x-mucyora-timestamp': timestamp,
            'x-mucyora-nonce': nonce,
            'x-mucyora-content-sha256': bodyDigest,
            'x-mucyora-signature': signature,
          },
          maxRedirects: 0,
          timeout: this.config.get('MUCYORA_ENGINE_TIMEOUT_MS', {
            infer: true,
          }),
        }),
      );
      const validation = schema.validate(response.data, {
        abortEarly: false,
        convert: false,
      });
      if (validation.error) {
        throw new EngineInvalidResponseError();
      }
      return validation.value;
    } catch (error) {
      if (error instanceof EngineInvalidResponseError) {
        throw error;
      }
      if (error instanceof AxiosError && error.response?.status === 422) {
        throw new EngineInvalidResponseError();
      }
      throw new EngineUnavailableError();
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    const maximum = this.config.get('MUCYORA_ENGINE_MAX_CONCURRENCY', {
      infer: true,
    });
    if (this.active >= maximum) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.active += 1;
  }

  private release(): void {
    this.active -= 1;
    this.waiters.shift()?.();
  }
}
