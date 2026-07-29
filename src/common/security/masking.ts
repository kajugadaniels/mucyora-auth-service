export function maskIdentifier(value: string, visibleSuffixLength = 4): string {
  if (
    !Number.isInteger(visibleSuffixLength) ||
    visibleSuffixLength < 0 ||
    visibleSuffixLength > value.length
  ) {
    throw new RangeError('Invalid identifier mask length.');
  }

  return `${'*'.repeat(value.length - visibleSuffixLength)}${value.slice(
    -visibleSuffixLength,
  )}`;
}
