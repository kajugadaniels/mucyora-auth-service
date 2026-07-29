/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { PerformanceTelemetryMiddleware } from './performance-telemetry.middleware';

describe('PerformanceTelemetryMiddleware', () => {
  it('records bounded route telemetry after the response finishes', () => {
    const middleware = new PerformanceTelemetryMiddleware();
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const response = new EventEmitter() as Response & EventEmitter;
    response.statusCode = 200;
    const next = jest.fn();

    middleware.use(
      {
        method: 'GET',
        path: '/api/v1/auth/sessions/11111111-1111-4111-8111-111111111111',
      } as Request,
      response,
      next as NextFunction,
    );
    response.emit('finish');

    expect(next).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'http_request_completed',
        route: '/api/v1/auth/sessions/:id',
        statusCode: 200,
        durationMs: expect.any(Number),
      }),
    );
  });
});
