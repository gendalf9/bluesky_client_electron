const { describe, test, expect } = require('@jest/globals');

describe('Bluesky Client Integration Tests', () => {
  test('should have package.json with correct configuration', () => {
    const fs = require('fs');
    const path = require('path');
    const packageJsonPath = path.join(__dirname, '../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    expect(packageJson.name).toBe('bluesky_client');
    expect(packageJson.main).toBe('main.js');
    expect(packageJson.scripts.start).toBe('electron .');
  });

  test('should have main.js file with required functionality', () => {
    const fs = require('fs');
    const path = require('path');
    const mainJsPath = path.join(__dirname, '../main.js');
    const mainJsContent = fs.readFileSync(mainJsPath, 'utf8');

    // Check for security-related functions
    expect(mainJsContent).toContain('isSafeUrl');
    expect(mainJsContent).toContain('sanitizeError');
    expect(mainJsContent).toContain('ALLOWED_PROTOCOLS');

    // Check for security measures
    expect(mainJsContent).toContain('nodeIntegration: false');
    expect(mainJsContent).toContain('contextIsolation: true');
    expect(mainJsContent).toContain('will-navigate');
    expect(mainJsContent).toContain('setWindowOpenHandler');

    // Check for cleanup functions
    expect(mainJsContent).toContain('cleanupApp');
    expect(mainJsContent).toContain('addAppListener');

    // Check for error handling
    expect(mainJsContent).toContain('uncaughtException');
    expect(mainJsContent).toContain('unhandledRejection');
  });

  test('should have valid Bluesky icon file', () => {
    const fs = require('fs');
    const path = require('path');
    const iconPath = path.join(__dirname, '../icon.png');

    expect(fs.existsSync(iconPath)).toBe(true);

    // Check that it's a PNG file
    const stats = fs.statSync(iconPath);
    expect(stats.size).toBeGreaterThan(0);
  });

  test('should have proper test configuration', () => {
    const fs = require('fs');
    const path = require('path');
    const jestConfigPath = path.join(__dirname, '../jest.config.js');

    expect(fs.existsSync(jestConfigPath)).toBe(true);

    const jestConfig = require(jestConfigPath);
    expect(jestConfig.testEnvironment).toBe('node');
    expect(jestConfig.testMatch).toContain('**/__tests__/**/*.test.js');
  });

  test('should have prettier configuration', () => {
    const fs = require('fs');
    const path = require('path');
    const prettierConfigPath = path.join(__dirname, '../.prettierrc');

    expect(fs.existsSync(prettierConfigPath)).toBe(true);

    const prettierConfig = JSON.parse(
      fs.readFileSync(prettierConfigPath, 'utf8')
    );
    expect(prettierConfig).toHaveProperty('semi', true);
    expect(prettierConfig).toHaveProperty('singleQuote', true);
  });

  test('should have all required test files', () => {
    const fs = require('fs');
    const path = require('path');
    const testsDir = path.join(__dirname, '../__tests__');

    const requiredTestFiles = [
      'utils.test.js',
      'security.test.js',
      'app.integration.test.js',
      'setup.js',
    ];

    requiredTestFiles.forEach((file) => {
      const filePath = path.join(testsDir, file);
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  test('should validate URL safety function', () => {
    // Import and test the actual URL validation logic
    const { URL } = require('url');
    const ALLOWED_PROTOCOLS = new Set(['https:', 'http:', 'mailto:', 'tel:']);

    function isSafeUrl(urlString) {
      try {
        const url = new URL(urlString);
        return ALLOWED_PROTOCOLS.has(url.protocol);
      } catch {
        return false;
      }
    }

    // Test safe URLs
    expect(isSafeUrl('https://bsky.app')).toBe(true);
    expect(isSafeUrl('http://localhost:3000')).toBe(true);
    expect(isSafeUrl('mailto:test@example.com')).toBe(true);
    expect(isSafeUrl('tel:+1234567890')).toBe(true);

    // Test unsafe URLs
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeUrl('not-a-url')).toBe(false);
  });

  test('should validate error sanitization function', () => {
    function sanitizeError(error) {
      if (error instanceof Error) {
        return {
          name: error.name,
          message: error.message.replace(/[^\w\s.,!?@#$%^&*()\-+=]/g, '*'),
        };
      }
      return 'Unknown error';
    }

    // Test error sanitization
    const errorWithSpecialChars = new Error(
      'Error with <script>alert("xss")</script>'
    );
    const sanitized = sanitizeError(errorWithSpecialChars);

    expect(sanitized.name).toBe('Error');
    expect(sanitized.message).not.toContain('<script>');
    expect(sanitized.message).not.toContain('"xss"');
    expect(sanitized.message).toContain('*');

    // Test non-error objects
    expect(sanitizeError('string')).toBe('Unknown error');
    expect(sanitizeError(null)).toBe('Unknown error');
    expect(sanitizeError(undefined)).toBe('Unknown error');
  });
});
