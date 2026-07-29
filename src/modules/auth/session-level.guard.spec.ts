import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SessionLevel } from '@mucyora/db';

import { SessionLevelGuard } from './session-level.guard';

describe('SessionLevelGuard', () => {
  it('prevents a limited session from entering a full-session route', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(SessionLevel.FULL),
    } as unknown as Reflector;
    const guard = new SessionLevelGuard(reflector);
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          auth: { sessionLevel: SessionLevel.LIMITED },
        }),
      }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(context)).toThrow(
      'Additional identity verification is required.',
    );
  });

  it('allows full sessions through limited or full gates', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(SessionLevel.LIMITED),
    } as unknown as Reflector;
    const guard = new SessionLevelGuard(reflector);
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          auth: { sessionLevel: SessionLevel.FULL },
        }),
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
  });
});
