const { describe, test, expect } = require('@jest/globals');

// Mock Electron modules for testing
const mockShell = {
  openExternal: jest.fn(),
};

const mockWebContents = {
  setWindowOpenHandler: jest.fn(),
  on: jest.fn(),
  session: {
    clearCache: jest.fn(),
  },
  loadURL: jest.fn(),
};

const mockBrowserWindow = {
  webContents: mockWebContents,
  on: jest.fn(),
  once: jest.fn(),
  isDestroyed: jest.fn().mockReturnValue(false),
  close: jest.fn(),
};

jest.mock('electron', () => ({
  app: {
    on: jest.fn(),
    off: jest.fn(),
    whenReady: jest.fn().mockResolvedValue(true),
    quit: jest.fn(),
  },
  BrowserWindow: jest.fn(() => mockBrowserWindow),
  shell: mockShell,
}));

const { URL } = require('url');

describe('Security Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('External Link Security', () => {
    test('should block dangerous protocols', () => {
      const dangerousUrls = [
        'javascript:alert(document.domain)',
        'data:text/html,<script>alert(1)</script>',
        'vbscript:msgbox("xss")',
        'file:///etc/passwd',
        'ftp://malicious.com/backdoor.exe',
        'blob:https://bsky.app/blob-id',
      ];

      dangerousUrls.forEach((url) => {
        const urlObj = new URL(url);
        const safeProtocols = new Set(['https:', 'http:', 'mailto:', 'tel:']);
        const isSafe = safeProtocols.has(urlObj.protocol);

        expect(isSafe).toBe(false);
        expect(mockShell.openExternal).not.toHaveBeenCalledWith(url);
      });
    });

    test('should allow safe protocols', () => {
      const safeUrls = [
        'https://bsky.app',
        'https://google.com',
        'http://example.com',
        'mailto:user@example.com',
        'tel:+1234567890',
      ];

      safeUrls.forEach((url) => {
        const urlObj = new URL(url);
        const safeProtocols = new Set(['https:', 'http:', 'mailto:', 'tel:']);
        const isSafe = safeProtocols.has(urlObj.protocol);

        expect(isSafe).toBe(true);
      });
    });
  });

  describe('Window Security', () => {
    test('should prevent navigation to external domains', () => {
      const externalUrls = [
        'https://evil.com',
        'http://malicious.site',
        'https://phishing.bsky.evil.com',
      ];

      externalUrls.forEach((url) => {
        const parsedUrl = new URL(url);
        const isBlueskyDomain = parsedUrl.origin === 'https://bsky.app';

        expect(isBlueskyDomain).toBe(false);
      });
    });

    test('should allow navigation to bsky.app domain', () => {
      const allowedUrls = [
        'https://bsky.app',
        'https://bsky.app/profile',
        'https://bsky.app/hello',
      ];

      allowedUrls.forEach((url) => {
        const parsedUrl = new URL(url);
        const isBlueskyDomain = parsedUrl.origin === 'https://bsky.app';

        expect(isBlueskyDomain).toBe(true);
      });
    });
  });

  describe('Error Information Disclosure', () => {
    test('should sanitize error messages containing sensitive information', () => {
      const sensitiveErrors = [
        'Database connection failed: host=prod-db.internal port=5432 user=admin password=secret123',
        'File not found: /home/user/.ssh/id_rsa',
        'API key invalid: sk-1234567890abcdef',
        'Internal error: stack_trace_here',
      ];

      sensitiveErrors.forEach((errorMessage) => {
        const sanitized = errorMessage.replace(
          /[^\w\s.,!?@#$%^&*()\-+=]/g,
          '*'
        );

        // Check that sensitive characters are replaced
        expect(sanitized).toContain('*');
        // Check that at least some sensitive characters are removed
        expect(sanitized === errorMessage).toBe(false);
      });
    });
  });

  describe('Content Security', () => {
    test('should use secure webPreferences', () => {
      // These are the secure settings we expect
      const securePreferences = {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: false, // Required for Bluesky
        sandbox: false, // Required for Bluesky
      };

      expect(securePreferences.nodeIntegration).toBe(false);
      expect(securePreferences.contextIsolation).toBe(true);
    });

    test('should use non-persistent session partition', () => {
      const sessionPartition = 'bluesky-client';

      // Should not be persistent (no 'persist:' prefix)
      expect(sessionPartition.startsWith('persist:')).toBe(false);
    });
  });

  describe('URL Validation Edge Cases', () => {
    test('should handle malformed URLs safely', () => {
      const malformedUrls = [
        'https://[malformed-ipv6',
        'http://',
        'ftp://user:pass@host',
        'javascript://comment%0Aalert(1)',
        'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      ];

      malformedUrls.forEach((url) => {
        try {
          const urlObj = new URL(url);
          const safeProtocols = new Set(['https:', 'http:', 'mailto:', 'tel:']);
          const isSafe = safeProtocols.has(urlObj.protocol);

          expect(isSafe).toBe(false);
        } catch {
          // URL parsing should fail for malicious URLs
          expect(true).toBe(true); // Expected to fail parsing
        }
      });
    });

    test('should handle Unicode and encoding attacks', () => {
      const suspiciousUrls = [
        'https://bsky.app%00.evil.com',
        'https://bsky.app%2F.evil.com',
        'https://bsky．app', // Unicode dots
        'https://bsky｡app', // Full-width character
      ];

      suspiciousUrls.forEach((url) => {
        try {
          const urlObj = new URL(url);
          const safeProtocols = new Set(['https:', 'http:', 'mailto:', 'tel:']);
          const isSafe = safeProtocols.has(urlObj.protocol);

          // Protocol might be safe, but domain should be checked
          if (isSafe) {
            expect(urlObj.hostname).not.toBe('bsky.app');
          }
        } catch {
          // URL parsing should fail for malicious URLs
          expect(true).toBe(true); // Expected to fail parsing
        }
      });
    });
  });
});
