export function decodeKeyMaterial(
  encoded: string,
  name: string,
  minimumBytes = 32,
): Buffer {
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(encoded)) {
    throw new Error(`${name} must be base64url-encoded key material.`);
  }

  const key = Buffer.from(encoded, 'base64url');
  if (key.length < minimumBytes) {
    throw new Error(`${name} must decode to at least ${minimumBytes} bytes.`);
  }

  return key;
}

export function assertPurposeSeparatedKeys(
  keys: ReadonlyArray<{ name: string; value: Buffer }>,
): void {
  for (let left = 0; left < keys.length; left += 1) {
    for (let right = left + 1; right < keys.length; right += 1) {
      if (keys[left].value.equals(keys[right].value)) {
        throw new Error(
          `${keys[left].name} and ${keys[right].name} must use different key material.`,
        );
      }
    }
  }
}
