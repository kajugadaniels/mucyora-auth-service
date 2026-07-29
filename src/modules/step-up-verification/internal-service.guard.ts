import { timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import { AuthEnvironment } from '../../config/environment.validation';

export type StepUpConsumerService =
  | 'mucyora-user'
  | 'mucyora-signature'
  | 'mucyora-auth-recovery'
  | 'mucyora-operations';

export interface InternalServiceRequest extends Request {
  internalService: StepUpConsumerService;
}

@Injectable()
export class InternalServiceGuard implements CanActivate {
  constructor(private readonly config: ConfigService<AuthEnvironment, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<InternalServiceRequest>();
    const service = request.header('x-mucyora-service-name') as
      StepUpConsumerService | undefined;
    const presented = request.header('x-mucyora-service-key');
    const expected = service ? this.keyFor(service) : undefined;

    if (!presented || !expected || !constantTimeEqual(presented, expected)) {
      throw new UnauthorizedException({
        code: 'INTERNAL_SERVICE_UNAUTHORIZED',
        message: 'Authorized service authentication is required.',
      });
    }
    request.internalService = service as StepUpConsumerService;
    return true;
  }

  private keyFor(service: StepUpConsumerService): string | undefined {
    switch (service) {
      case 'mucyora-user':
        return this.config.get('MUCYORA_USER_SERVICE_KEY', { infer: true });
      case 'mucyora-signature':
        return this.config.get('MUCYORA_SIGNATURE_SERVICE_KEY', {
          infer: true,
        });
      case 'mucyora-auth-recovery':
        return this.config.get('MUCYORA_AUTH_RECOVERY_SERVICE_KEY', {
          infer: true,
        });
      case 'mucyora-operations':
        return this.config.get('MUCYORA_OPERATIONS_SERVICE_KEY', {
          infer: true,
        });
      default:
        return undefined;
    }
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}
