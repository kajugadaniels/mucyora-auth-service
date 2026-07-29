import { Injectable } from '@nestjs/common';
import Joi from 'joi';

import { CitizenIdentityResult } from './citizen-identity-provider';
import {
  CitizenNotFoundError,
  CitizenProviderResponseError,
} from './citizen-provider.errors';

const providerDataSchema = Joi.object({
  providerReference: Joi.string().trim().max(200),
  referenceNumber: Joi.string().trim().max(200),
  nationality: Joi.string().trim().max(100),
  countryOfBirth: Joi.string().trim().max(100),
  surName: Joi.string().trim().max(200),
  surname: Joi.string().trim().max(200),
  postNames: Joi.string().trim().max(300),
  givenNames: Joi.string().trim().max(300),
  dateOfBirth: Joi.string().trim().max(32).required(),
  sex: Joi.string().trim().max(32).required(),
  documentStatus: Joi.string().trim().max(64),
  portraitReference: Joi.string().trim().max(500),
  sourceUpdatedAt: Joi.string().isoDate(),
})
  .or('surName', 'surname')
  .or('postNames', 'givenNames')
  .unknown(true);

const providerResponseSchema = Joi.object({
  status: Joi.string().trim().lowercase().required(),
  data: Joi.alternatives().conditional('status', {
    is: 'ok',
    then: providerDataSchema.required(),
    otherwise: Joi.any(),
  }),
}).unknown(true);

const cachedResultSchema = Joi.object<CitizenIdentityResult>({
  providerReference: Joi.string().max(200).allow(null).required(),
  nationality: Joi.string().max(100).required(),
  surname: Joi.string().max(200).required(),
  givenNames: Joi.string().max(300).required(),
  dateOfBirth: Joi.string().isoDate().required(),
  sex: Joi.string().max(32).required(),
  documentStatus: Joi.string().max(64).required(),
  portraitReference: Joi.string().max(500).allow(null).required(),
  sourceUpdatedAt: Joi.string().isoDate().allow(null).required(),
})
  .required()
  .unknown(false);

interface ValidatedProviderResponse {
  status: string;
  data?: Record<string, unknown>;
}

@Injectable()
export class CitizenResponseMapper {
  fromProvider(payload: unknown): CitizenIdentityResult {
    const validation = providerResponseSchema.validate(payload, {
      abortEarly: false,
      convert: true,
    });

    if (validation.error) {
      throw new CitizenProviderResponseError();
    }

    const response = validation.value as ValidatedProviderResponse;

    if (response.status === 'not_found' || response.status === 'not-found') {
      throw new CitizenNotFoundError();
    }

    if (response.status !== 'ok' || !response.data) {
      throw new CitizenProviderResponseError();
    }

    const data = response.data;

    return {
      providerReference: this.optionalString(
        data.providerReference ?? data.referenceNumber,
      ),
      nationality:
        this.optionalString(data.nationality ?? data.countryOfBirth) ??
        'UNKNOWN',
      surname: String(data.surName ?? data.surname),
      givenNames: String(data.postNames ?? data.givenNames),
      dateOfBirth: this.normalizeDate(String(data.dateOfBirth)),
      sex: String(data.sex).toUpperCase(),
      documentStatus:
        this.optionalString(data.documentStatus)?.toUpperCase() ?? 'UNKNOWN',
      portraitReference: this.optionalString(data.portraitReference),
      sourceUpdatedAt: this.optionalString(data.sourceUpdatedAt),
    };
  }

  fromCache(payload: string): CitizenIdentityResult {
    let parsed: unknown;

    try {
      parsed = JSON.parse(payload);
    } catch {
      throw new CitizenProviderResponseError();
    }

    const validation = cachedResultSchema.validate(parsed, {
      abortEarly: false,
      convert: false,
    });

    if (validation.error) {
      throw new CitizenProviderResponseError();
    }

    return validation.value;
  }

  private normalizeDate(value: string): string {
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const localMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
    const parts = isoMatch
      ? [isoMatch[1], isoMatch[2], isoMatch[3]]
      : localMatch
        ? [localMatch[3], localMatch[2], localMatch[1]]
        : null;

    if (!parts) {
      throw new CitizenProviderResponseError();
    }

    const normalized = parts.join('-');
    const date = new Date(`${normalized}T00:00:00.000Z`);

    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== normalized
    ) {
      throw new CitizenProviderResponseError();
    }

    return normalized;
  }

  private optionalString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
  }
}
