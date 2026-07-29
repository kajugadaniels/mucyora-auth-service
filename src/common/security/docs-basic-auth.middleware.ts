import { timingSafeEqual } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

export function createDocsBasicAuthMiddleware(
  expectedUsername: string,
  expectedPassword: string,
) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const credentials = parseBasicCredentials(request.header('authorization'));

    if (
      credentials &&
      constantTimeEqual(credentials.username, expectedUsername) &&
      constantTimeEqual(credentials.password, expectedPassword)
    ) {
      next();
      return;
    }

    response.setHeader('WWW-Authenticate', 'Basic realm="MUCYORA Auth Docs"');
    response.status(401).json({
      statusCode: 401,
      message: 'Documentation authentication is required.',
    });
  };
}

function parseBasicCredentials(
  authorization?: string,
): { username: string; password: string } | null {
  if (!authorization?.startsWith('Basic ')) {
    return null;
  }

  try {
    const decoded = Buffer.from(authorization.slice(6), 'base64').toString(
      'utf8',
    );
    const separator = decoded.indexOf(':');
    if (separator < 0) {
      return null;
    }

    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

function constantTimeEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}
