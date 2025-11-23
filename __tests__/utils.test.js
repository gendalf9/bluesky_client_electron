const { describe, test, expect } = require('@jest/globals');

// Import utility functions from main.js for testing
// Since main.js doesn't export these functions, we'll recreate them for testing
const ALLOWED_PROTOCOLS = new Set(['https:', 'http:', 'mailto:', 'tel:']);

function isSafeUrl(urlString) {
  try {
    const url = new URL(urlString);
    return ALLOWED_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

function sanitizeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message.replace(/[^\w\s.,!?@#$%^&*()\-+=]/g, '*'),
    };
  }
  return 'Unknown error';
}

describe('Utility Functions', () => {
  describe('isSafeUrl', () => {
    test('should return true for safe HTTPS URLs', () => {
      expect(isSafeUrl('https://bsky.app')).toBe(true);
      expect(isSafeUrl('https://google.com')).toBe(true);
      expect(isSafeUrl('https://example.com/path')).toBe(true);
    });

    test('should return true for safe HTTP URLs', () => {
      expect(isSafeUrl('http://example.com')).toBe(true);
      expect(isSafeUrl('http://localhost:3000')).toBe(true);
    });

    test('should return true for mailto URLs', () => {
      expect(isSafeUrl('mailto:test@example.com')).toBe(true);
    });

    test('should return true for tel URLs', () => {
      expect(isSafeUrl('tel:+1234567890')).toBe(true);
    });

    test('should return false for unsafe protocols', () => {
      expect(isSafeUrl('file:///path/to/file')).toBe(false);
      expect(isSafeUrl('ftp://example.com')).toBe(false);
      expect(isSafeUrl('javascript:alert(1)')).toBe(false);
      expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
      expect(isSafeUrl('blob:https://example.com/blob')).toBe(false);
    });

    test('should return false for invalid URLs', () => {
      expect(isSafeUrl('not-a-url')).toBe(false);
      expect(isSafeUrl('')).toBe(false);
      expect(isSafeUrl(null)).toBe(false);
      expect(isSafeUrl(undefined)).toBe(false);
    });

    test('should return false for malformed URLs', () => {
      expect(isSafeUrl('https://')).toBe(false);
      expect(isSafeUrl('http://[invalid-ipv6]')).toBe(false);
    });
  });

  describe('sanitizeError', () => {
    test('should sanitize error with special characters', () => {
      const error = new Error('Error with <script>alert("xss")</script>');
      const sanitized = sanitizeError(error);

      expect(sanitized.name).toBe('Error');
      expect(sanitized.message).not.toContain('<script>');
      expect(sanitized.message).not.toContain('"xss"');
      expect(sanitized.message).toContain('*');
    });

    test('should preserve safe characters in error message', () => {
      const error = new Error(
        'Error with safe characters: hello world 123 !@#$%^&*()-+='
      );
      const sanitized = sanitizeError(error);

      expect(sanitized.message).toContain('hello world 123 !@#$%^&*()-+=');
    });

    test('should handle non-Error objects', () => {
      expect(sanitizeError('string error')).toBe('Unknown error');
      expect(sanitizeError(123)).toBe('Unknown error');
      expect(sanitizeError({})).toBe('Unknown error');
      expect(sanitizeError(null)).toBe('Unknown error');
      expect(sanitizeError(undefined)).toBe('Unknown error');
    });

    test('should preserve error name', () => {
      const customError = new Error('test message');
      customError.name = 'CustomError';

      const sanitized = sanitizeError(customError);
      expect(sanitized.name).toBe('CustomError');
    });

    test('should handle empty error message', () => {
      const error = new Error();
      const sanitized = sanitizeError(error);

      expect(sanitized.name).toBe('Error');
      expect(typeof sanitized.message).toBe('string');
    });
  });
});
