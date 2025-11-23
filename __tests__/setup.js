// Jest setup file
const { TextEncoder, TextDecoder } = require('util');

// Polyfill for TextEncoder/TextDecoder for Node environment
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock console methods for testing
global.console = {
  ...console,
  warn: jest.fn(),
  error: jest.fn(),
};

// Set up global test timeout
jest.setTimeout(10000);
