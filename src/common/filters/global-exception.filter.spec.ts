import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { Request, Response } from 'express';
import { CorrelatedRequest } from '../middleware/correlation-id.middleware';
import { GlobalExceptionFilter } from './global-exception.filter';

describe('GlobalExceptionFilter', () => {
  it('does not expose unexpected error details or stack traces', () => {
    const statusCalls: number[] = [];
    let responseBody: unknown;
    const status = (statusCode: number) => {
      statusCalls.push(statusCode);
      return {
        json: (body: unknown) => {
          responseBody = body;
        },
      };
    };
    const request = {
      method: 'GET',
      originalUrl: '/failing',
      correlationId: 'correlation-1',
    } as CorrelatedRequest;
    const response = { status } as unknown as Response;
    const host = {
      switchToHttp: () => ({
        getRequest: <T extends Request>() => request as T,
        getResponse: <T extends Response>() => response as T,
        getNext: jest.fn(),
      }),
    } as ArgumentsHost;

    new GlobalExceptionFilter().catch(
      new Error('DATABASE_URL=postgresql://secret'),
      host,
    );

    expect(statusCalls).toEqual([500]);
    expect(responseBody).toMatchObject({
      statusCode: 500,
      path: '/failing',
      correlationId: 'correlation-1',
      message: 'An unexpected error occurred.',
      error: 'Internal Server Error',
    });
    expect((responseBody as { timestamp?: unknown }).timestamp).toEqual(
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    );
    expect(JSON.stringify(responseBody)).not.toContain('postgresql');
  });

  it('returns a stable application error code', () => {
    const statusCalls: number[] = [];
    let responseBody: unknown;
    const response = {
      status: (statusCode: number) => {
        statusCalls.push(statusCode);
        return {
          json: (body: unknown) => {
            responseBody = body;
          },
        };
      },
    } as unknown as Response;
    const request = {
      method: 'POST',
      originalUrl: '/api/v1/registration/citizen/lookup',
      correlationId: 'correlation-1',
    } as CorrelatedRequest;
    const host = {
      switchToHttp: () => ({
        getRequest: <T extends Request>() => request as T,
        getResponse: <T extends Response>() => response as T,
        getNext: jest.fn(),
      }),
    } as ArgumentsHost;

    new GlobalExceptionFilter().catch(
      new BadRequestException({
        code: 'CLIENT_INSTANCE_INVALID',
        message: 'Request failed.',
      }),
      host,
    );

    expect(statusCalls).toEqual([400]);
    expect(responseBody).toMatchObject({
      code: 'CLIENT_INSTANCE_INVALID',
      message: 'Request failed.',
    });
  });
});
