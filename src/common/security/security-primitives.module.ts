import { Global, Module } from '@nestjs/common';
import {
  defaultIdentityNonceFactory,
  IDENTITY_NONCE_FACTORY,
  IdentityEncryptionService,
} from './identity-encryption.service';
import { IdempotencyService } from './idempotency.service';
import { KeyedDigestService } from './keyed-digest.service';
import { TokenService } from './token.service';

@Global()
@Module({
  providers: [
    {
      provide: IDENTITY_NONCE_FACTORY,
      useValue: defaultIdentityNonceFactory,
    },
    IdentityEncryptionService,
    IdempotencyService,
    KeyedDigestService,
    TokenService,
  ],
  exports: [
    IdentityEncryptionService,
    IdempotencyService,
    KeyedDigestService,
    TokenService,
  ],
})
export class SecurityPrimitivesModule {}
