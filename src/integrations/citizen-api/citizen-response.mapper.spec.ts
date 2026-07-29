import {
  CitizenNotFoundError,
  CitizenProviderResponseError,
} from './citizen-provider.errors';
import { CitizenResponseMapper } from './citizen-response.mapper';

describe('CitizenResponseMapper', () => {
  const mapper = new CitizenResponseMapper();

  it('retains only the approved normalized citizen fields', () => {
    const result = mapper.fromProvider({
      status: 'ok',
      data: {
        nid: '1199887766554433',
        surName: 'Mucyo',
        postNames: 'Ora Test',
        sex: 'f',
        dateOfBirth: '31/12/1998',
        countryOfBirth: 'Rwanda',
        documentStatus: 'active',
        providerReference: 'provider-123',
        privateProviderField: 'must-not-escape',
      },
    });

    expect(result).toEqual({
      providerReference: 'provider-123',
      nationality: 'Rwanda',
      surname: 'Mucyo',
      givenNames: 'Ora Test',
      dateOfBirth: '1998-12-31',
      sex: 'F',
      documentStatus: 'ACTIVE',
      portraitReference: null,
      sourceUpdatedAt: null,
    });
    expect(JSON.stringify(result)).not.toContain('1199887766554433');
    expect(JSON.stringify(result)).not.toContain('privateProviderField');
  });

  it('rejects impossible dates and malformed success payloads', () => {
    expect(() =>
      mapper.fromProvider({
        status: 'ok',
        data: {
          surName: 'Mucyo',
          postNames: 'Ora',
          sex: 'F',
          dateOfBirth: '31/02/1998',
        },
      }),
    ).toThrow(CitizenProviderResponseError);
  });

  it('maps an explicit not-found response to a safe domain error', () => {
    expect(() => mapper.fromProvider({ status: 'not_found' })).toThrow(
      CitizenNotFoundError,
    );
  });
});
