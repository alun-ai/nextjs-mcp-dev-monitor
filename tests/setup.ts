/**
 * Jest test setup and global configuration
 */

// Global test timeout
jest.setTimeout(30000);

// Mock console methods for cleaner test output
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Setup environment variables for tests
process.env.NODE_ENV = 'test';

// Global test utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toMatchErrorPattern(expected: RegExp): R;
    }
  }
}

// Custom Jest matchers
expect.extend({
  toMatchErrorPattern(received: string, pattern: RegExp) {
    const pass = pattern.test(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to match pattern ${pattern}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to match pattern ${pattern}`,
        pass: false,
      };
    }
  },
});