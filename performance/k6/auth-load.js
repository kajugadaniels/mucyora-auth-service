import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import exec from 'k6/execution';
import { Counter, Rate, Trend } from 'k6/metrics';

const baseUrl = __ENV.BASE_URL || 'http://127.0.0.1:3000';
const accessToken = __ENV.ACCESS_TOKEN || '';
const refreshTokens = parseJsonArray(__ENV.REFRESH_TOKENS_JSON || '[]');
const syntheticEmail = __ENV.SYNTHETIC_EMAIL || 'load-user@example.test';
const syntheticPassword =
  __ENV.SYNTHETIC_PASSWORD || 'Synthetic load password 2026!';
const syntheticNid = __ENV.SYNTHETIC_NID || '1000000000000001';
const registrationChallengeToken = __ENV.REGISTRATION_CHALLENGE_TOKEN || '';

assertSafeTarget(baseUrl);
http.setResponseCallback(http.expectedStatuses(200, 201, 401, 409, 429));

const requestFailures = new Rate('mucyora_request_failures');
const loginLatency = new Trend('mucyora_login_duration', true);
const refreshLatency = new Trend('mucyora_refresh_duration', true);
const raceWinners = new Counter('mucyora_refresh_race_winners');

export const options = {
  discardResponseBodies: true,
  scenarios: {
    login: {
      executor: 'constant-arrival-rate',
      exec: 'login',
      rate: numberEnv('LOGIN_RATE', 2),
      timeUnit: '1s',
      duration: __ENV.LOAD_DURATION || '2m',
      preAllocatedVUs: 4,
      maxVUs: 20,
    },
    refresh: {
      executor: 'per-vu-iterations',
      exec: 'refresh',
      vus: Math.max(1, refreshTokens.length),
      iterations: numberEnv('REFRESH_ITERATIONS', 20),
      startTime: '5s',
      maxDuration: '3m',
    },
    refreshRace: {
      executor: 'shared-iterations',
      exec: 'refreshRace',
      vus: 1,
      iterations: refreshTokens.length > 0 ? 1 : 0,
      startTime: '10s',
      maxDuration: '30s',
    },
    registrationRace: {
      executor: 'shared-iterations',
      exec: 'registrationRace',
      vus: 1,
      iterations: registrationChallengeToken ? 1 : 0,
      startTime: '15s',
      maxDuration: '30s',
    },
    citizenCache: {
      executor: 'constant-vus',
      exec: 'citizenCache',
      vus: numberEnv('CITIZEN_VUS', 2),
      duration: __ENV.LOAD_DURATION || '2m',
      startTime: '5s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    mucyora_request_failures: ['rate<0.02'],
    mucyora_login_duration: ['p(95)<750', 'p(99)<1200'],
    mucyora_refresh_duration: ['p(95)<250', 'p(99)<500'],
    http_req_duration: ['p(95)<750', 'p(99)<1200'],
  },
};

export function login() {
  const response = http.post(
    `${baseUrl}/api/v1/auth/login`,
    JSON.stringify({
      email: syntheticEmail,
      password: syntheticPassword,
      deviceId: `k6-${exec.vu.idInTest}-${exec.scenario.iterationInTest}`,
      transport: 'NATIVE',
    }),
    jsonHeaders(),
  );
  loginLatency.add(response.timings.duration);
  const accepted = check(response, {
    'login returns success or enforced rate limit': (result) =>
      result.status === 200 || result.status === 429,
  });
  requestFailures.add(!accepted);
  sleep(0.05);
}

export function refresh() {
  if (refreshTokens.length === 0) return;
  const index = (exec.vu.idInTest - 1) % refreshTokens.length;
  let token = refreshTokens[index];
  const response = http.post(
    `${baseUrl}/api/v1/auth/refresh`,
    JSON.stringify({ transport: 'NATIVE', refreshToken: token }),
    jsonHeaders(),
  );
  refreshLatency.add(response.timings.duration);
  const accepted = check(response, {
    'refresh rotates successfully': (result) => result.status === 200,
  });
  requestFailures.add(!accepted);
  if (accepted && response.body) {
    token = response.json('refreshToken');
    refreshTokens[index] = token;
  }
}

export function refreshRace() {
  if (refreshTokens.length === 0) return;
  const token = refreshTokens[0];
  const requests = Array.from({ length: 5 }, () => [
    'POST',
    `${baseUrl}/api/v1/auth/refresh`,
    JSON.stringify({ transport: 'NATIVE', refreshToken: token }),
    jsonHeaders(),
  ]);
  const responses = http.batch(requests);
  const winners = responses.filter(
    (response) => response.status === 200,
  ).length;
  raceWinners.add(winners);
  check(winners, {
    'refresh race has at most one winner': (value) => value <= 1,
  });
  check(responses, {
    'refresh race rejects every loser safely': (values) =>
      values.every((response) => [200, 401, 409].includes(response.status)),
  });
}

export function registrationRace() {
  if (!registrationChallengeToken) return;
  const body = JSON.stringify({
    registrationChallengeToken,
    email: syntheticEmail,
    password: syntheticPassword,
    consents: [
      { type: 'IDENTITY_DATA_PROCESSING', policyVersion: '2026-07-01' },
      { type: 'BIOMETRIC_PROCESSING', policyVersion: '2026-07-01' },
      { type: 'TERMS_OF_SERVICE', policyVersion: '2026-07-01' },
      { type: 'PRIVACY_POLICY', policyVersion: '2026-07-01' },
    ],
  });
  const requests = Array.from({ length: 5 }, () => [
    'POST',
    `${baseUrl}/api/v1/registration`,
    body,
    {
      ...jsonHeaders(),
      headers: {
        ...jsonHeaders().headers,
        'idempotency-key': 'k6-registration-race-0001',
      },
    },
  ]);
  const responses = http.batch(requests);
  check(responses, {
    'registration race is idempotent or conflicts safely': (values) =>
      values.every((response) => [201, 409].includes(response.status)),
  });
}

export function citizenCache() {
  const response = http.post(
    `${baseUrl}/api/v1/registration/citizen/lookup`,
    JSON.stringify({
      nid: syntheticNid,
      email: syntheticEmail,
    }),
    {
      ...jsonHeaders(),
      headers: {
        ...jsonHeaders().headers,
        'x-client-instance-id': `k6-client-${exec.vu.idInTest}`,
      },
    },
  );
  const accepted = check(response, {
    'citizen lookup succeeds or rate limits': (result) =>
      result.status === 201 || result.status === 429,
  });
  requestFailures.add(!accepted);
}

function jsonHeaders() {
  return {
    responseType: 'text',
    headers: {
      'content-type': 'application/json',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
  };
}

function assertSafeTarget(value) {
  const host = new URL(value).hostname;
  const local = host === '127.0.0.1' || host === 'localhost';
  if (!local && __ENV.ALLOW_APPROVED_STAGING_TARGET !== 'true') {
    fail('Load tests default to localhost; approve staging explicitly.');
  }
  if (/production|prod\./i.test(host)) {
    fail('Production targets are forbidden.');
  }
}

function numberEnv(name, fallback) {
  const value = Number(__ENV[name] || fallback);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    fail('REFRESH_TOKENS_JSON must be a JSON array.');
  }
}
