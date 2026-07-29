import { Global, Module } from '@nestjs/common';
import {
  defaultIdentityNonceFactory,
  IDENTITY_NONCE_FACTORY,
  IdentityEncryptionService,
} from './identity-encryption.service';
import { IdempotencyService } from './idempotency.service';
import { KeyedDigestService } from './keyed-digest.service';
import { PasswordPolicyService } from './password-policy.service';
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
    PasswordPolicyService,
    TokenService,
  ],
  exports: [
    IdentityEncryptionService,
    IdempotencyService,
    KeyedDigestService,
    PasswordPolicyService,
    TokenService,
  ],
})
export class SecurityPrimitivesModule {}
