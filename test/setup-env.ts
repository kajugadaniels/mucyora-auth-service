import { generateKeyPairSync } from 'node:crypto';

const testSigningKeys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

process.env.APP_ENV = 'test';
process.env.DATABASE_URL =
  'postgresql://mucyora_auth_app:placeholder@localhost:5432/mucyora';
process.env.IDENTITY_ENCRYPTION_KEY_VERSION = 'v1';
process.env.IDENTITY_ENCRYPTION_SECRET =
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
process.env.IDENTITY_LOOKUP_KEY_VERSION = 'v1';
process.env.IDENTITY_LOOKUP_HMAC_KEY =
  'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE';
process.env.TOKEN_DIGEST_HMAC_KEY =
  'AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI';
process.env.REQUEST_CONTEXT_HMAC_KEY =
  'AwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwM';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.CITIZEN_API_URL = 'http://localhost:3100/citizens/lookup';
process.env.CITIZEN_API_USERNAME = 'test-client';
process.env.CITIZEN_API_PASSWORD = 'test-password';
process.env.CITIZEN_LOOKUP_IP_LIMIT_PER_MINUTE = '5';
process.env.CITIZEN_LOOKUP_CLIENT_LIMIT_PER_MINUTE = '5';
process.env.CITIZEN_LOOKUP_NID_LIMIT_PER_MINUTE = '3';
process.env.REGISTRATION_CHALLENGE_TTL_SECONDS = '600';
process.env.REGISTRATION_CHALLENGE_MAX_ATTEMPTS = '3';
process.env.PASSWORD_ARGON2_MEMORY_KIB = '32768';
process.env.PASSWORD_ARGON2_TIME_COST = '2';
process.env.PASSWORD_ARGON2_PARALLELISM = '1';
process.env.PASSWORD_HASH_MAX_CONCURRENCY = '2';
process.env.PASSWORD_RESET_TOKEN_TTL_SECONDS = '900';
process.env.PASSWORD_RESET_LIMIT_PER_HOUR = '3';
process.env.PASSWORD_CHANGE_LIMIT_PER_HOUR = '5';
process.env.EMAIL_TOKEN_TTL_SECONDS = '86400';
process.env.REGISTRATION_LIMIT_PER_HOUR = '3';
process.env.EMAIL_RESEND_LIMIT_PER_HOUR = '3';
process.env.MAIL_OUTBOX_WORKER_ENABLED = 'false';
process.env.MUCYORA_USER_APP_URL = 'http://localhost:4000';
process.env.MUCYORA_AUTH_ISSUER = 'http://localhost:3000';
process.env.MUCYORA_AUTH_ACCESS_AUDIENCES = 'mucyora-user,mucyora-signature';
process.env.MUCYORA_AUTH_SIGNING_KEY_ID = 'test-key-2026';
process.env.MUCYORA_AUTH_SIGNING_PRIVATE_KEY = testSigningKeys.privateKey;
process.env.MUCYORA_AUTH_SIGNING_PUBLIC_KEY = testSigningKeys.publicKey;
process.env.ACCESS_TOKEN_TTL_SECONDS = '900';
process.env.LIMITED_ACCESS_TOKEN_TTL_SECONDS = '900';
process.env.REFRESH_TOKEN_TTL_SECONDS = '2592000';
process.env.REFRESH_REPLAY_GRACE_SECONDS = '10';
process.env.LOGIN_LIMIT_PER_MINUTE = '5';
process.env.REFRESH_LIMIT_PER_MINUTE = '10';
process.env.LOGIN_LOCK_THRESHOLD = '10';
process.env.LOGIN_LOCK_SECONDS = '900';
process.env.COOKIE_SECURE = 'false';
process.env.COOKIE_SAME_SITE = 'lax';
