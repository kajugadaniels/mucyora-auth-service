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
process.env.AWS_REGION = 'eu-west-1';
process.env.AWS_S3_VERIFICATION_BUCKET = 'mucyora-verification-test';
process.env.AWS_S3_VERIFICATION_PREFIX = 'identity-verification/';
process.env.VERIFICATION_UPLOAD_TTL_SECONDS = '300';
process.env.VERIFICATION_MEDIA_MAX_SIZE_BYTES = '5242880';
process.env.VERIFICATION_MEDIA_MAX_PIXELS = '20000000';
process.env.VERIFICATION_MEDIA_RETENTION_SECONDS = '86400';
process.env.VERIFICATION_MAX_ATTEMPTS = '3';
process.env.VERIFICATION_ATTEMPT_WINDOW_HOURS = '24';
process.env.VERIFICATION_RETRY_DELAY_SECONDS = '3600';
process.env.VERIFICATION_POLICY_VERSION = '2026-07-01';
process.env.VERIFICATION_CLEANUP_ENABLED = 'false';
process.env.VERIFICATION_CLEANUP_INTERVAL_MS = '300000';
process.env.MUCYORA_ENGINE_URL = 'http://localhost:8000';
process.env.MUCYORA_ENGINE_SERVICE_KEY =
  'test-engine-service-key-at-least-thirty-two-bytes';
process.env.MUCYORA_ENGINE_TIMEOUT_MS = '45000';
process.env.MUCYORA_ENGINE_MAX_CONCURRENCY = '4';
