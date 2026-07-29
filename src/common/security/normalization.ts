import { BadRequestException } from '@nestjs/common';

export function normalizeEmail(email: string): string {
  const normalized = email.normalize('NFKC').trim().toLowerCase();

  if (
    normalized.length < 3 ||
    normalized.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    throw new BadRequestException('A valid email address is required.');
  }

  return normalized;
}

export function normalizeRwandaNid(nid: string): string {
  const canonical = nid.normalize('NFKC').replace(/[\s-]/g, '');

  if (!/^\d{16}$/.test(canonical)) {
    throw new BadRequestException(
      'A valid 16-digit Rwanda National ID is required.',
    );
  }

  return canonical;
}
