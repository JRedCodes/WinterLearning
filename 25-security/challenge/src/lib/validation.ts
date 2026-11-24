/**
 * Shared input rules. Used by controllers before data reaches the services.
 */

// Letters/digits, optionally separated by . _ or -, then @domain.tld
export const EMAIL_PATTERN = /^([a-zA-Z0-9]+[._-]?)+@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

// A file name is a single path segment: no slashes, no leading dot, sane length.
export const FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._'()-]{0,99}$/;
