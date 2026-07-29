import { sleep } from 'k6';
import { citizenCache, login, refresh } from './auth-load.js';

export const options = {
  scenarios: {
    soakLogin: {
      executor: 'constant-arrival-rate',
      exec: 'soakLogin',
      rate: 1,
      timeUnit: '1s',
      duration: __ENV.SOAK_DURATION || '30m',
      preAllocatedVUs: 4,
      maxVUs: 12,
    },
    soakRefresh: {
      executor: 'constant-vus',
      exec: 'soakRefresh',
      vus: 2,
      duration: __ENV.SOAK_DURATION || '30m',
    },
    soakCitizenCache: {
      executor: 'constant-vus',
      exec: 'soakCitizenCache',
      vus: 1,
      duration: __ENV.SOAK_DURATION || '30m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<750', 'p(99)<1200'],
  },
};

export function soakLogin() {
  login();
  sleep(0.2);
}

export function soakRefresh() {
  refresh();
  sleep(1);
}

export function soakCitizenCache() {
  citizenCache();
  sleep(1);
}
