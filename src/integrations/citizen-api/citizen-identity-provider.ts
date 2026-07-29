export const CITIZEN_IDENTITY_PROVIDER = Symbol('CITIZEN_IDENTITY_PROVIDER');

export interface CitizenLookupContext {
  correlationId: string;
}

export interface CitizenIdentityResult {
  providerReference: string | null;
  nationality: string;
  surname: string;
  givenNames: string;
  dateOfBirth: string;
  sex: string;
  documentStatus: string;
  portraitReference: string | null;
  sourceUpdatedAt: string | null;
}

export interface CitizenIdentityProvider {
  findByNationalId(
    nationalId: string,
    context: CitizenLookupContext,
  ): Promise<CitizenIdentityResult>;
}
