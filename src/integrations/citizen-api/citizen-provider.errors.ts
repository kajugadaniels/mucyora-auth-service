export type CitizenProviderErrorCode =
  | 'CITIZEN_NOT_FOUND'
  | 'CITIZEN_PROVIDER_UNAVAILABLE'
  | 'CITIZEN_PROVIDER_RESPONSE_INVALID';

export abstract class CitizenProviderError extends Error {
  abstract readonly code: CitizenProviderErrorCode;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class CitizenNotFoundError extends CitizenProviderError {
  readonly code = 'CITIZEN_NOT_FOUND' as const;

  constructor() {
    super('Citizen record was not found');
  }
}

export class CitizenProviderUnavailableError extends CitizenProviderError {
  readonly code = 'CITIZEN_PROVIDER_UNAVAILABLE' as const;

  constructor() {
    super('Citizen identity service is temporarily unavailable');
  }
}

export class CitizenProviderResponseError extends CitizenProviderError {
  readonly code = 'CITIZEN_PROVIDER_RESPONSE_INVALID' as const;

  constructor() {
    super('Citizen identity service returned an invalid response');
  }
}
