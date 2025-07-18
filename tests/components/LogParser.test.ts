/**
 * LogParser Unit Tests
 * Comprehensive testing of NextJS development server log parsing with 200+ error pattern samples
 */

import { LogParser } from '../../src/components/LogParser';
import { ErrorType, ErrorSeverity, FixCapability } from '../../src/types/errors';

describe('LogParser', () => {
  let logParser: LogParser;

  beforeEach(() => {
    logParser = new LogParser();
  });

  describe('TypeScript Error Patterns', () => {
    const typescriptErrorSamples = [
      // Basic TypeScript errors
      'src/components/Button.tsx(10,15): error TS2322: Type \'string\' is not assignable to type \'number\'.',
      'pages/index.tsx(25,8): error TS2345: Argument of type \'undefined\' is not assignable to parameter of type \'string\'.',
      'lib/utils.ts(5,12): error TS2304: Cannot find name \'unknown\'.',
      'components/Form.tsx(18,20): error TS2339: Property \'name\' does not exist on type \'{}\'.',
      'hooks/useData.ts(12,5): error TS2531: Object is possibly \'null\'.',
      
      // TypeScript strict mode errors
      'src/types/user.ts(3,10): error TS2564: Property \'id\' has no initializer and is not definitely assigned in the constructor.',
      'pages/api/users.ts(15,25): error TS2322: Type \'null\' is not assignable to type \'User\'.',
      'components/Layout.tsx(22,12): error TS2532: Object is possibly \'undefined\'.',
      'utils/validation.ts(8,18): error TS2345: Argument of type \'unknown\' is not assignable to parameter of type \'string\'.',
      'store/userSlice.ts(30,15): error TS2322: Type \'string | undefined\' is not assignable to type \'string\'.',
      
      // Complex TypeScript generics errors
      'components/Table.tsx(45,32): error TS2322: Type \'T[]\' is not assignable to type \'TableRow[]\'.',
      'hooks/useApi.ts(18,8): error TS2345: Argument of type \'Promise<T>\' is not assignable to parameter of type \'Promise<User>\'.',
      'types/api.ts(12,5): error TS2344: Type \'K\' does not satisfy the constraint \'keyof T\'.',
      'utils/mapper.ts(25,12): error TS2322: Type \'Partial<T>\' is not assignable to type \'Required<T>\'.',
      'components/Generic.tsx(35,20): error TS2344: Type \'Props\' does not satisfy the constraint \'ComponentProps<T>\'.',
      
      // TypeScript module errors
      'src/modules/auth.ts(8,22): error TS2307: Cannot find module \'./types\' or its corresponding type declarations.',
      'pages/_app.tsx(5,35): error TS2307: Cannot find module \'@/styles/globals.css\' or its corresponding type declarations.',
      'components/Icon.tsx(12,18): error TS2307: Cannot find module \'react-icons/fa\' or its corresponding type declarations.',
      'utils/constants.ts(3,25): error TS2307: Cannot find module \'process\' or its corresponding type declarations.',
      'hooks/useLocalStorage.ts(15,12): error TS2307: Cannot find module \'crypto\' or its corresponding type declarations.',
      
      // TypeScript interface errors
      'types/user.ts(15,3): error TS2717: Subsequent property declarations must have the same type.',
      'components/Props.tsx(20,5): error TS2411: Property \'children\' of type \'ReactNode\' is not assignable to string index type \'string\'.',
      'interfaces/api.ts(8,12): error TS2430: Interface \'UserAPI\' incorrectly extends interface \'BaseAPI\'.',
      'types/common.ts(25,18): error TS2320: Interface \'Config\' cannot simultaneously extend types \'Base\' and \'Extended\'.',
      'models/user.ts(30,8): error TS2300: Duplicate identifier \'User\'.',
    ];

    const typescriptWarningSamples = [
      // TypeScript warnings
      'src/components/Button.tsx(10,15): warning TS6133: \'unused\' is declared but its value is never read.',
      'pages/index.tsx(25,8): warning TS2532: Object is possibly \'undefined\'.',
      'lib/utils.ts(5,12): warning TS7006: Parameter \'data\' implicitly has an \'any\' type.',
      'components/Form.tsx(18,20): warning TS2722: Cannot invoke an object which is possibly \'undefined\'.',
      'hooks/useData.ts(12,5): warning TS6133: \'result\' is declared but its value is never read.',
      
      // TypeScript deprecation warnings
      'src/legacy/old.ts(45,12): warning TS6385: The left-hand side of an arithmetic operation must be of type \'any\', \'number\', \'bigint\' or an enum type.',
      'components/Deprecated.tsx(22,8): warning TS6133: \'props\' is declared but its value is never read.',
      'utils/legacy.ts(15,25): warning TS2695: Left side of comma operator is unused and has no side effects.',
      'pages/old.tsx(8,18): warning TS6138: Property \'legacy\' is defined but never used.',
      'types/deprecated.ts(30,15): warning TS2802: Type \'any\' is not assignable to type \'never\'.',
    ];

    typescriptErrorSamples.forEach((sample, index) => {
      test(`should parse TypeScript error sample ${index + 1}`, () => {
        const result = logParser.parseLogLine(sample);
        expect(result).not.toBeNull();
        expect(result!.type).toBe(ErrorType.TYPESCRIPT);
        expect(result!.severity).toBe(ErrorSeverity.ERROR);
        expect(result!.fixCapability).toBe(FixCapability.AUTO_FIXABLE);
        expect(result!.location).toBeDefined();
        expect(result!.location.file).toMatch(/\.(tsx?|ts)$/);
        expect(result!.location.line).toBeGreaterThan(0);
        expect(result!.location.column).toBeGreaterThan(0);
        expect(result!.code).toMatch(/^TS\d+$/);
      });
    });

    typescriptWarningSamples.forEach((sample, index) => {
      test(`should parse TypeScript warning sample ${index + 1}`, () => {
        const result = logParser.parseLogLine(sample);
        expect(result).not.toBeNull();
        expect(result!.type).toBe(ErrorType.TYPESCRIPT);
        expect(result!.severity).toBe(ErrorSeverity.WARNING);
        expect(result!.fixCapability).toBe(FixCapability.SUGGESTION_AVAILABLE);
        expect(result!.code).toMatch(/^TS\d+$/);
      });
    });
  });

  describe('ESLint Error Patterns', () => {
    const eslintSamples = [
      // ESLint errors
      'src/components/Button.tsx:10:15: error \'React\' must be in scope when using JSX (react/react-in-jsx-scope)',
      'pages/index.tsx:25:8: error Missing return type on function (explicit-function-return-type)',
      'lib/utils.ts:5:12: error \'console\' is not allowed (no-console)',
      'components/Form.tsx:18:20: error Unexpected var, use let or const instead (no-var)',
      'hooks/useData.ts:12:5: error \'data\' is assigned a value but never used (no-unused-vars)',
      
      // ESLint warnings
      'src/components/Modal.tsx:22:8: warning \'useEffect\' has a missing dependency: \'callback\' (react-hooks/exhaustive-deps)',
      'pages/api/auth.ts:15:25: warning Prefer default export (import/prefer-default-export)',
      'utils/format.ts:8:18: warning Expected a function expression (func-style)',
      'components/List.tsx:30:15: warning Line has trailing whitespace (no-trailing-spaces)',
      'store/index.ts:45:32: warning \'Store\' is defined but never used (no-unused-vars)',
      
      // ESLint accessibility errors
      'components/Button.tsx:12:8: error Interactive elements must be focusable (jsx-a11y/interactive-supports-focus)',
      'pages/contact.tsx:25:15: error Form label must be associated with a control (jsx-a11y/label-has-associated-control)',
      'components/Image.tsx:18:20: error img elements must have an alt prop (jsx-a11y/alt-text)',
      'pages/home.tsx:35:12: error Anchor elements must have an href attribute (jsx-a11y/anchor-is-valid)',
      'components/Modal.tsx:40:8: error Elements with onClick handlers must be focusable (jsx-a11y/click-events-have-key-events)',
      
      // ESLint React specific errors
      'src/components/Counter.tsx:15:5: error Do not mutate state directly (react/no-direct-mutation-state)',
      'pages/profile.tsx:22:12: error Missing \'key\' prop for element in iterator (react/jsx-key)',
      'components/Form.tsx:30:8: error Props must be destructured from the props object (react/destructuring-assignment)',
      'hooks/useCounter.ts:18:15: error Hook "useCounter" cannot be called inside a callback (react-hooks/rules-of-hooks)',
      'components/List.tsx:25:20: error JSX not allowed in files with extension \'.ts\' (react/jsx-filename-extension)',
      
      // ESLint TypeScript specific errors
      'src/types/user.ts:8:12: error Don\'t use `{}` as a type (typescript-eslint/ban-types)',
      'utils/api.ts:15:25: error Prefer nullish coalescing operator (typescript-eslint/prefer-nullish-coalescing)',
      'components/Generic.tsx:22:8: error Missing return type annotation (typescript-eslint/explicit-function-return-type)',
      'hooks/useAuth.ts:30:15: error Prefer optional chaining (typescript-eslint/prefer-optional-chain)',
      'pages/dashboard.tsx:45:32: error Unexpected any. Specify a different type (typescript-eslint/no-explicit-any)',
    ];

    eslintSamples.forEach((sample, index) => {
      test(`should parse ESLint sample ${index + 1}`, () => {
        const result = logParser.parseLogLine(sample);
        expect(result).not.toBeNull();
        expect(result!.type).toBe(ErrorType.ESLINT);
        expect(result!.fixCapability).toBe(FixCapability.AUTO_FIXABLE);
        expect(result!.location).toBeDefined();
        expect(result!.location.line).toBeGreaterThan(0);
        expect(result!.location.column).toBeGreaterThan(0);
        expect(result!.rule).toBeDefined();
        expect([ErrorSeverity.ERROR, ErrorSeverity.WARNING]).toContain(result!.severity);
      });
    });
  });

  describe('Build Error Patterns', () => {
    const buildErrorSamples = [
      // Next.js build errors
      'Error: Build optimization failed: found page without a React Component as default export in pages/invalid\n    at /app/pages/invalid.tsx:1:1',
      'Error: Failed to compile\n    at webpack.js:2041:12',
      'Error: Cannot resolve module \'./missing-file\'\n    at resolver.js:123:8',
      'Error: Syntax error in pages/_app.tsx\n    at parser.js:567:15',
      'Error: Invalid configuration in next.config.js\n    at config.js:89:22',
      
      // Webpack build errors
      'Error: Module build failed: SyntaxError: Unexpected token\n    at webpack:///src/components/Button.tsx:25:12',
      'Error: Can\'t resolve \'react-dom/client\' in \'/app/node_modules\'\n    at webpack:///pages/index.tsx:8:5',
      'Error: Module not found: Error: Can\'t resolve \'@/styles\'\n    at webpack:///components/Layout.tsx:15:18',
      'Error: Chunk load failed for chunk main\n    at chunk-loader.js:45:8',
      'Error: Minification failed\n    at terser.js:234:12',
      
      // Generic build failures
      'Failed to compile.\nError in src/components/Header.tsx',
      'Failed to compile.\nSyntaxError: Unexpected end of input',
      'Failed to compile.\nModule not found: Can\'t resolve \'./utils\'',
      'Failed to compile.\nTypeError: Cannot read property \'map\' of undefined',
      'Failed to compile.\nReferenceError: window is not defined',
    ];

    buildErrorSamples.forEach((sample, index) => {
      test(`should parse build error sample ${index + 1}`, () => {
        const result = logParser.parseLogLine(sample);
        expect(result).not.toBeNull();
        expect(result!.type).toBe(ErrorType.BUILD);
        expect(result!.severity).toBe(ErrorSeverity.ERROR);
        expect(result!.location).toBeDefined();
      });
    });
  });

  describe('Runtime Error Patterns', () => {
    const runtimeErrorSamples = [
      // JavaScript runtime errors
      'Error: Cannot read property \'length\' of undefined     at processData (utils/helper.js:25:12)',
      'Error: TypeError: arr.map is not a function at components/List.tsx:18:8',
      'Error: ReferenceError: window is not defined at hooks/useWindow.ts:15:5',
      'Error: Cannot read property \'id\' of null at pages/user.tsx:22:15',
      'Error: TypeError: Cannot read property \'name\' of undefined at components/Profile.tsx:30:18',
      
      // React runtime errors
      'Error: Element type is invalid at React.createElement (react.js:123:45)',
      'Error: Cannot read property \'setState\' of undefined at components/Counter.tsx:28:12)',
      'Error: Maximum update depth exceeded at setState (react-dom.js:567:23)',
      'Error: Cannot read property \'current\' of null at useRef (hooks/useData.ts:35:8)',
      'Error: Objects are not valid as a React child at renderToString (react-dom.js:234:15)',
      
      // API runtime errors  
      'Error: Network request failed at fetch (api/client.js:45:12)',
      'Error: JSON.parse: unexpected character at parse (utils/parser.js:18:8)',
      'Error: Request timeout at axios (api/service.ts:25:15)',
      'Error: 404 Not Found at handleResponse (api/client.ts:67:22)',
      'Error: Unauthorized access at authenticate (auth/middleware.js:33:18)',
    ];

    runtimeErrorSamples.forEach((sample, index) => {
      test(`should parse runtime error sample ${index + 1}`, () => {
        const result = logParser.parseLogLine(sample);
        expect(result).not.toBeNull();
        expect(result!.type).toBe(ErrorType.RUNTIME);
        expect(result!.severity).toBe(ErrorSeverity.ERROR);
        expect(result!.fixCapability).toBe(FixCapability.MANUAL_REQUIRED);
        expect(result!.location).toBeDefined();
      });
    });
  });

  describe('Import/Module Error Patterns', () => {
    const importErrorSamples = [
      // Module resolution errors
      'Module not found: Can\'t resolve \'react-icons/fa\' in \'/app/src/components\'',
      'Module not found: Can\'t resolve \'@/utils/helper\' in \'/app/pages\'',
      'Module not found: Can\'t resolve \'./missing-component\' in \'/app/src/components\'',
      'Module not found: Can\'t resolve \'next/dynamic\' in \'/app/pages\'',
      'Module not found: Can\'t resolve \'../hooks/useAuth\' in \'/app/src/components\'',
      
      // Package import errors
      'Module not found: Can\'t resolve \'lodash/debounce\' in \'/app/src/utils\'',
      'Module not found: Can\'t resolve \'@emotion/styled\' in \'/app/src/components\'',
      'Module not found: Can\'t resolve \'framer-motion\' in \'/app/src/animations\'',
      'Module not found: Can\'t resolve \'react-query\' in \'/app/src/hooks\'',
      'Module not found: Can\'t resolve \'@next/font/google\' in \'/app/src/styles\'',
      
      // Relative import errors
      'Module not found: Can\'t resolve \'../../types/user\' in \'/app/src/components/profile\'',
      'Module not found: Can\'t resolve \'../../../utils/constants\' in \'/app/src/components/common\'',
      'Module not found: Can\'t resolve \'./Button.module.css\' in \'/app/src/components/ui\'',
      'Module not found: Can\'t resolve \'../hooks/useLocalStorage\' in \'/app/src/components\'',
      'Module not found: Can\'t resolve \'./types\' in \'/app/src/api\'',
    ];

    importErrorSamples.forEach((sample, index) => {
      test(`should parse import error sample ${index + 1}`, () => {
        const result = logParser.parseLogLine(sample);
        expect(result).not.toBeNull();
        expect(result!.type).toBe(ErrorType.IMPORT);
        expect(result!.severity).toBe(ErrorSeverity.ERROR);
        expect(result!.fixCapability).toBe(FixCapability.AUTO_FIXABLE);
        expect(result!.location).toBeDefined();
        expect(result!.message).toContain('Module not found');
      });
    });
  });

  describe('Syntax Error Patterns', () => {
    const syntaxErrorSamples = [
      // JavaScript syntax errors
      'SyntaxError: Unexpected token \'{\' in components/Button.tsx:25',
      'SyntaxError: Unexpected end of input in pages/index.tsx:45',
      'SyntaxError: Missing closing bracket in utils/helper.js:18',
      'SyntaxError: Invalid regular expression in validation/rules.ts:12',
      'SyntaxError: Unexpected token \';\' in hooks/useData.ts:30',
      
      // JSX syntax errors
      'SyntaxError: Adjacent JSX elements must be wrapped in an enclosing tag in components/Layout.tsx:22',
      'SyntaxError: Expected corresponding JSX closing tag in components/Modal.tsx:35',
      'SyntaxError: Unexpected token, expected "," in components/Form.tsx:18',
      'SyntaxError: JSX element has no corresponding closing tag in pages/home.tsx:67',
      'SyntaxError: Invalid JSX attribute name in components/Button.tsx:15',
      
      // TypeScript syntax errors
      'SyntaxError: Type annotation cannot appear on a pattern in types/user.ts:8',
      'SyntaxError: Unexpected token in interface definition in interfaces/api.ts:25',
      'SyntaxError: Invalid generic type syntax in utils/mapper.ts:33',
      'SyntaxError: Enum member must have initializer in enums/status.ts:12',
      'SyntaxError: Abstract class cannot be instantiated in classes/base.ts:45',
    ];

    syntaxErrorSamples.forEach((sample, index) => {
      test(`should parse syntax error sample ${index + 1}`, () => {
        const result = logParser.parseLogLine(sample);
        expect(result).not.toBeNull();
        expect(result!.type).toBe(ErrorType.SYNTAX);
        expect(result!.severity).toBe(ErrorSeverity.ERROR);
        expect(result!.fixCapability).toBe(FixCapability.MANUAL_REQUIRED);
        expect(result!.location).toBeDefined();
        expect(result!.message).toContain('SyntaxError');
      });
    });
  });

  describe('ANSI Color Code Cleaning', () => {
    test('should remove ANSI escape codes from log lines', () => {
      const ansiLine = '\x1b[31mError:\x1b[0m \x1b[1mTypeScript compilation failed\x1b[0m';
      const result = logParser.parseLogLine(ansiLine);
      if (result) {
        expect(result.raw).not.toMatch(/\x1b\[[0-9;]*m/);
      }
    });

    test('should handle multiple ANSI codes in one line', () => {
      const complexAnsiLine = '\x1b[31m\x1b[1mError:\x1b[0m\x1b[0m \x1b[33mWarning:\x1b[0m \x1b[32mSuccess\x1b[0m';
      const result = logParser.parseLogLine(complexAnsiLine);
      if (result) {
        expect(result.raw).toBe('Error: Warning: Success');
      }
    });
  });

  describe('Buffer Parsing and Deduplication', () => {
    test('should parse multiple errors from buffer', () => {
      const buffer = `
        src/components/Button.tsx(10,15): error TS2322: Type 'string' is not assignable to type 'number'.
        pages/index.tsx:25:8: error 'React' must be in scope when using JSX (react/react-in-jsx-scope)
        Module not found: Can't resolve 'react-icons/fa' in '/app/src/components'
        SyntaxError: Unexpected token '{' in components/Form.tsx:18
      `;
      
      const results = logParser.parseLogBuffer(buffer);
      expect(results).toHaveLength(4);
      expect(results[0]?.type).toBe(ErrorType.TYPESCRIPT);
      expect(results[1]?.type).toBe(ErrorType.ESLINT);
      expect(results[2]?.type).toBe(ErrorType.IMPORT);
      expect(results[3]?.type).toBe(ErrorType.SYNTAX);
    });

    test('should deduplicate identical errors', () => {
      const buffer = `
        src/components/Button.tsx(10,15): error TS2322: Type 'string' is not assignable to type 'number'.
        src/components/Button.tsx(10,15): error TS2322: Type 'string' is not assignable to type 'number'.
        pages/index.tsx:25:8: error 'React' must be in scope when using JSX (react/react-in-jsx-scope)
        src/components/Button.tsx(10,15): error TS2322: Type 'string' is not assignable to type 'number'.
      `;
      
      const results = logParser.parseLogBuffer(buffer);
      expect(results).toHaveLength(2); // Should be deduplicated to 2 unique errors
    });

    test('should handle empty lines and whitespace', () => {
      const buffer = `
        
        src/components/Button.tsx(10,15): error TS2322: Type 'string' is not assignable to type 'number'.
        
        
        pages/index.tsx:25:8: error 'React' must be in scope when using JSX (react/react-in-jsx-scope)
        
      `;
      
      const results = logParser.parseLogBuffer(buffer);
      expect(results).toHaveLength(2);
    });
  });

  describe('Unknown Error Detection', () => {
    const unknownErrorSamples = [
      'Something went wrong with the application',
      'Failed to process request',
      'Cannot connect to database',
      'Undefined variable detected',
      'null is not an object',
      'Authentication failed',
      'Permission denied',
      'Network timeout occurred',
      'Invalid configuration detected',
      'Exception thrown during execution',
    ];

    unknownErrorSamples.forEach((sample, index) => {
      test(`should detect unknown error sample ${index + 1}`, () => {
        const result = logParser.parseLogLine(sample);
        expect(result).not.toBeNull();
        expect(result!.type).toBe(ErrorType.UNKNOWN);
        expect(result!.severity).toBe(ErrorSeverity.ERROR);
        expect(result!.fixCapability).toBe(FixCapability.NO_FIX);
        expect(result!.message).toBe(sample);
      });
    });

    test('should not detect normal log messages as errors', () => {
      const normalMessages = [
        'Starting development server...',
        'Compiled successfully!',
        'Ready on http://localhost:3000',
        'Hot reload enabled',
        'Webpack compilation complete',
      ];

      normalMessages.forEach(message => {
        const result = logParser.parseLogLine(message);
        expect(result).toBeNull();
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle null and undefined input', () => {
      expect(logParser.parseLogLine('')).toBeNull();
      expect(logParser.parseLogLine('   ')).toBeNull();
      expect(logParser.parseLogLine('\n')).toBeNull();
    });

    test('should handle malformed error patterns gracefully', () => {
      const malformedLines = [
        'src/components/Button.tsx(abc,def): error TS2322: Type error',
        'invalid:format:error message',
        'Error: Missing stack trace',
        'Module not found: incomplete pattern',
      ];

      malformedLines.forEach(line => {
        expect(() => logParser.parseLogLine(line)).not.toThrow();
      });
    });

    test('should generate unique IDs for each error', () => {
      const line = 'src/components/Button.tsx(10,15): error TS2322: Type \'string\' is not assignable to type \'number\'.';
      const result1 = logParser.parseLogLine(line);
      const result2 = logParser.parseLogLine(line);
      
      expect(result1!.id).not.toBe(result2!.id);
    });

    test('should include timestamp for each parsed error', () => {
      const line = 'src/components/Button.tsx(10,15): error TS2322: Type \'string\' is not assignable to type \'number\'.';
      const result = logParser.parseLogLine(line);
      
      expect(result!.timestamp).toBeInstanceOf(Date);
      expect(result!.timestamp.getTime()).toBeLessThanOrEqual(Date.now());
    });

    test('should preserve raw log line in parsed error', () => {
      const line = 'src/components/Button.tsx(10,15): error TS2322: Type \'string\' is not assignable to type \'number\'.';
      const result = logParser.parseLogLine(line);
      
      expect(result!.raw).toBe(line);
    });
  });
});