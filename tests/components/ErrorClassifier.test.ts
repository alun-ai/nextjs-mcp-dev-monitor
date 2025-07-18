/**
 * ErrorClassifier Unit Tests
 * Comprehensive testing of error classification accuracy, priority scoring, and fix strategies
 */

import { ErrorClassifier } from '../../src/components/ErrorClassifier';
import { ParsedError, ErrorType, ErrorSeverity, FixCapability } from '../../src/types/errors';
import { randomUUID } from 'crypto';

describe('ErrorClassifier', () => {
  let errorClassifier: ErrorClassifier;

  beforeEach(() => {
    errorClassifier = new ErrorClassifier();
  });

  // Helper function to create test errors
  const createTestError = (
    type: ErrorType,
    message: string,
    severity: ErrorSeverity = ErrorSeverity.ERROR,
    fixCapability: FixCapability = FixCapability.MANUAL_REQUIRED,
    file: string = 'test.tsx',
    code?: string,
    rule?: string
  ): ParsedError => ({
    id: randomUUID(),
    type,
    severity,
    message,
    code,
    rule,
    location: {
      file,
      line: 10,
      column: 5,
    },
    fixCapability,
    timestamp: new Date(),
    raw: message,
  });

  describe('TypeScript Error Classification', () => {
    test('should assign high priority to module not found errors', () => {
      const error = createTestError(
        ErrorType.TYPESCRIPT,
        'Cannot find module \'react-icons/fa\' or its corresponding type declarations.',
        ErrorSeverity.ERROR,
        FixCapability.AUTO_FIXABLE,
        'components/Icon.tsx',
        'TS2307'
      );

      const classified = errorClassifier.classifyError(error);

      expect(classified.priority).toBe(90);
      expect(classified.autoFixable).toBe(true);
      expect(classified.groupId).toBe('ts-TS2307');
      expect(classified.suggestedFix).toContain('npm install react-icons/fa');
    });

    test('should assign medium-high priority to property does not exist errors', () => {
      const error = createTestError(
        ErrorType.TYPESCRIPT,
        'Property \'name\' does not exist on type \'{}\'.',
        ErrorSeverity.ERROR,
        FixCapability.MANUAL_REQUIRED,
        'components/User.tsx',
        'TS2339'
      );

      const classified = errorClassifier.classifyError(error);

      expect(classified.priority).toBe(80);
      expect(classified.autoFixable).toBe(false);
      expect(classified.groupId).toBe('ts-TS2339');
      expect(classified.suggestedFix).toContain('Check property name spelling');
    });

    test('should assign medium priority to type assignment errors', () => {
      const error = createTestError(
        ErrorType.TYPESCRIPT,
        'Type \'string\' is not assignable to type \'number\'.',
        ErrorSeverity.ERROR,
        FixCapability.MANUAL_REQUIRED,
        'utils/helpers.ts',
        'TS2322'
      );

      const classified = errorClassifier.classifyError(error);

      expect(classified.priority).toBe(70);
      expect(classified.autoFixable).toBe(false);
      expect(classified.groupId).toBe('ts-TS2322');
      expect(classified.suggestedFix).toContain('Fix type mismatch');
    });

    test('should assign lower priority to missing return statement', () => {
      const error = createTestError(
        ErrorType.TYPESCRIPT,
        'Missing return statement in function returning number.',
        ErrorSeverity.ERROR,
        FixCapability.AUTO_FIXABLE,
        'utils/calculator.ts',
        'TS2355'
      );

      const classified = errorClassifier.classifyError(error);

      expect(classified.priority).toBe(60);
      expect(classified.autoFixable).toBe(true);
      expect(classified.suggestedFix).toContain('Add return statement');
    });

    test('should assign low priority to unused variable warnings', () => {
      const error = createTestError(
        ErrorType.TYPESCRIPT,
        '\'unusedVar\' is declared but its value is never read.',
        ErrorSeverity.WARNING,
        FixCapability.AUTO_FIXABLE,
        'components/Test.tsx',
        'TS6133'
      );

      const classified = errorClassifier.classifyError(error);

      expect(classified.priority).toBe(30);
      expect(classified.autoFixable).toBe(true);
      expect(classified.groupId).toBe('ts-TS6133');
    });

    test('should detect auto-fixable TypeScript patterns', () => {
      const autoFixableErrors = [
        createTestError(ErrorType.TYPESCRIPT, 'Cannot find module \'./missing\'', ErrorSeverity.ERROR),
        createTestError(ErrorType.TYPESCRIPT, 'Unused variable: result', ErrorSeverity.WARNING),
        createTestError(ErrorType.TYPESCRIPT, 'Missing return statement in function', ErrorSeverity.ERROR),
        createTestError(ErrorType.TYPESCRIPT, 'Property \'id\' does not exist on type \'User\'. Did you mean \'userId\'?', ErrorSeverity.ERROR),
      ];

      autoFixableErrors.forEach(error => {
        const classified = errorClassifier.classifyError(error);
        expect(classified.autoFixable).toBe(true);
      });
    });
  });

  describe('ESLint Error Classification', () => {
    test('should assign high priority to undefined variable errors', () => {
      const error = createTestError(
        ErrorType.ESLINT,
        '\'React\' is not defined',
        ErrorSeverity.ERROR,
        FixCapability.AUTO_FIXABLE,
        'components/Button.tsx',
        undefined,
        'no-undef'
      );

      const classified = errorClassifier.classifyError(error);

      expect(classified.priority).toBe(85);
      expect(classified.autoFixable).toBe(true);
      expect(classified.groupId).toBe('eslint-no-undef');
      expect(classified.suggestedFix).toContain('Import the undefined variable');
    });

    test('should assign high priority to unexpected token errors', () => {
      const error = createTestError(
        ErrorType.ESLINT,
        'Unexpected token \'{\'',
        ErrorSeverity.ERROR,
        FixCapability.MANUAL_REQUIRED,
        'pages/index.tsx',
        undefined,
        'parsing-error'
      );

      const classified = errorClassifier.classifyError(error);

      expect(classified.priority).toBe(80);
      expect(classified.groupId).toBe('eslint-parsing-error');
    });

    test('should assign low priority to semicolon errors', () => {
      const error = createTestError(
        ErrorType.ESLINT,
        'Missing semicolon',
        ErrorSeverity.ERROR,
        FixCapability.AUTO_FIXABLE,
        'utils/helpers.js',
        undefined,
        'semi'
      );

      const classified = errorClassifier.classifyError(error);

      expect(classified.priority).toBe(50); // Base priority for error
      expect(classified.autoFixable).toBe(true);
      expect(classified.suggestedFix).toContain('Add semicolon');
    });

    test('should assign very low priority to trailing comma warnings', () => {
      const error = createTestError(
        ErrorType.ESLINT,
        'Trailing comma not allowed',
        ErrorSeverity.WARNING,
        FixCapability.AUTO_FIXABLE,
        'config/settings.js',
        undefined,
        'comma-dangle'
      );

      const classified = errorClassifier.classifyError(error);

      expect(classified.priority).toBe(15);
      expect(classified.autoFixable).toBe(true);
      expect(classified.suggestedFix).toContain('Remove or add trailing comma');
    });

    test('should assign very low priority to indentation warnings', () => {
      const error = createTestError(
        ErrorType.ESLINT,
        'Expected indentation of 2 spaces but found 4',
        ErrorSeverity.WARNING,
        FixCapability.AUTO_FIXABLE,
        'components/Layout.tsx',
        undefined,
        'indent'
      );

      const classified = errorClassifier.classifyError(error);

      expect(classified.priority).toBe(10);
      expect(classified.autoFixable).toBe(true);
      expect(classified.suggestedFix).toContain('Fix indentation');
    });

    test('should detect auto-fixable ESLint patterns', () => {
      const autoFixableErrors = [
        createTestError(ErrorType.ESLINT, 'Missing semicolon', ErrorSeverity.ERROR, FixCapability.AUTO_FIXABLE),
        createTestError(ErrorType.ESLINT, 'Trailing comma not allowed', ErrorSeverity.WARNING, FixCapability.AUTO_FIXABLE),
        createTestError(ErrorType.ESLINT, 'Expected indentation of 2 spaces', ErrorSeverity.WARNING, FixCapability.AUTO_FIXABLE),
        createTestError(ErrorType.ESLINT, 'Missing space before opening brace', ErrorSeverity.WARNING, FixCapability.AUTO_FIXABLE),
        createTestError(ErrorType.ESLINT, 'Quotes must be single quotes', ErrorSeverity.WARNING, FixCapability.AUTO_FIXABLE),
      ];

      autoFixableErrors.forEach(error => {
        const classified = errorClassifier.classifyError(error);
        expect(classified.autoFixable).toBe(true);
      });
    });
  });

  describe('Build Error Classification', () => {
    test('should assign highest priority to compilation failures', () => {
      const error = createTestError(
        ErrorType.BUILD,
        'Failed to compile',
        ErrorSeverity.ERROR,
        FixCapability.MANUAL_REQUIRED,
        'pages/_app.tsx'
      );

      const classified = errorClassifier.classifyError(error);

      expect(classified.priority).toBe(100); // 95 + 10 boost - 5 adjustment = 100 (max)
      expect(classified.groupId).toBe('build-pages/_app.tsx');
    });

    test('should assign high priority to module build failures', () => {
      const error = createTestError(
        ErrorType.BUILD,
        'Module build failed: SyntaxError',
        ErrorSeverity.ERROR,
        FixCapability.MANUAL_REQUIRED,
        'components/Button.tsx'
      );

      const classified = errorClassifier.classifyError(error);

      expect(classified.priority).toBe(100);
      expect(classified.groupId).toBe('build-components/Button.tsx');
    });

    test('should assign high priority to syntax errors in build', () => {
      const error = createTestError(
        ErrorType.BUILD,
        'SyntaxError: Unexpected token',
        ErrorSeverity.ERROR,
        FixCapability.MANUAL_REQUIRED,
        'utils/parser.js'
      );

      const classified = errorClassifier.classifyError(error);

      expect(classified.priority).toBe(95);
      expect(classified.groupId).toBe('build-utils/parser.js');
    });

    test('should assign medium-high priority to reference errors', () => {
      const error = createTestError(
        ErrorType.BUILD,
        'ReferenceError: window is not defined',
        ErrorSeverity.ERROR,
        FixCapability.MANUAL_REQUIRED,
        'hooks/useWindow.ts'
      );

      const classified = errorClassifier.classifyError(error);

      expect(classified.priority).toBe(90);
      expect(classified.groupId).toBe('build-hooks/useWindow.ts');
    });

    test('should detect auto-fixable build patterns', () => {
      const autoFixableErrors = [
        createTestError(ErrorType.BUILD, 'Missing dependency in package.json', ErrorSeverity.ERROR),
        createTestError(ErrorType.BUILD, 'Incorrect file extension .js should be .ts', ErrorSeverity.ERROR),
      ];

      autoFixableErrors.forEach(error => {
        const classified = errorClassifier.classifyError(error);
        expect(classified.autoFixable).toBe(true);
      });
    });
  });

  describe('Runtime Error Classification', () => {
    test('should assign high priority to TypeErrors', () => {
      const error = createTestError(
        ErrorType.RUNTIME,
        'TypeError: Cannot read property \'map\' of undefined',
        ErrorSeverity.ERROR,
        FixCapability.MANUAL_REQUIRED,
        'components/List.tsx'
      );

      const classified = errorClassifier.classifyError(error);

      expect(classified.priority).toBe(85);
      expect(classified.groupId).toBe('runtime-TypeError:');
      expect(classified.autoFixable).toBe(false);
    });

    test('should assign high priority to ReferenceErrors', () => {
      const error = createTestError(
        ErrorType.RUNTIME,
        'ReferenceError: window is not defined',
        ErrorSeverity.ERROR,
        FixCapability.MANUAL_REQUIRED,
        'utils/dom.js'
      );

      const classified = errorClassifier.classifyError(error);

      expect(classified.priority).toBe(80);
      expect(classified.groupId).toBe('runtime-ReferenceError:');
    });

    test('should assign medium-high priority to property read errors', () => {
      const error = createTestError(
        ErrorType.RUNTIME,
        'Cannot read property \'length\' of null',
        ErrorSeverity.ERROR,
        FixCapability.MANUAL_REQUIRED,
        'utils/array.js'
      );

      const classified = errorClassifier.classifyError(error);

      expect(classified.priority).toBe(75);
      expect(classified.groupId).toBe('runtime-Cannot');
    });

    test('should assign medium priority to function call errors', () => {
      const error = createTestError(
        ErrorType.RUNTIME,
        'arr.map is not a function',
        ErrorSeverity.ERROR,
        FixCapability.MANUAL_REQUIRED,
        'components/Data.tsx'
      );

      const classified = errorClassifier.classifyError(error);

      expect(classified.priority).toBe(70);
      expect(classified.groupId).toBe('runtime-arr.map');
    });

    test('should not mark runtime errors as auto-fixable by default', () => {
      const runtimeErrors = [
        createTestError(ErrorType.RUNTIME, 'TypeError: Cannot read property', ErrorSeverity.ERROR),
        createTestError(ErrorType.RUNTIME, 'ReferenceError: undefined variable', ErrorSeverity.ERROR),
        createTestError(ErrorType.RUNTIME, 'Cannot read property of null', ErrorSeverity.ERROR),
      ];

      runtimeErrors.forEach(error => {
        const classified = errorClassifier.classifyError(error);
        expect(classified.autoFixable).toBe(false);
      });
    });
  });

  describe('Import Error Classification', () => {
    test('should assign high priority to module not found errors', () => {
      const error = createTestError(
        ErrorType.IMPORT,
        'Module not found: Can\'t resolve \'react-router-dom\'',
        ErrorSeverity.ERROR,
        FixCapability.AUTO_FIXABLE,
        'pages/index.tsx'
      );

      const classified = errorClassifier.classifyError(error);

      expect(classified.priority).toBe(90);
      expect(classified.autoFixable).toBe(true);
      expect(classified.groupId).toBe('import-pages/index.tsx');
      expect(classified.suggestedFix).toContain('npm install react-router-dom');
    });

    test('should assign high priority to module resolution errors', () => {
      const error = createTestError(
        ErrorType.IMPORT,
        'Cannot resolve module \'./components/Header\'',
        ErrorSeverity.ERROR,
        FixCapability.AUTO_FIXABLE,
        'pages/layout.tsx'
      );

      const classified = errorClassifier.classifyError(error);

      expect(classified.priority).toBe(85);
      expect(classified.autoFixable).toBe(true);
      expect(classified.groupId).toBe('import-pages/layout.tsx');
      expect(classified.suggestedFix).toContain('Check file path');
    });

    test('should assign medium-high priority to invalid import errors', () => {
      const error = createTestError(
        ErrorType.IMPORT,
        'Invalid import syntax',
        ErrorSeverity.ERROR,
        FixCapability.MANUAL_REQUIRED,
        'utils/imports.js'
      );

      const classified = errorClassifier.classifyError(error);

      expect(classified.priority).toBe(80);
      expect(classified.groupId).toBe('import-utils/imports.js');
    });

    test('should generate appropriate fix suggestions for import errors', () => {
      const packageError = createTestError(
        ErrorType.IMPORT,
        'Module not found: Can\'t resolve \'lodash\'',
        ErrorSeverity.ERROR
      );

      const relativeError = createTestError(
        ErrorType.IMPORT,
        'Module not found: Can\'t resolve \'./missing-file\'',
        ErrorSeverity.ERROR
      );

      const packageClassified = errorClassifier.classifyError(packageError);
      const relativeClassified = errorClassifier.classifyError(relativeError);

      expect(packageClassified.suggestedFix).toContain('npm install lodash');
      expect(relativeClassified.suggestedFix).toContain('Check file path');
    });

    test('should detect auto-fixable import patterns', () => {
      const autoFixableErrors = [
        createTestError(ErrorType.IMPORT, 'Module not found: Can\'t resolve', ErrorSeverity.ERROR),
        createTestError(ErrorType.IMPORT, 'Cannot resolve module', ErrorSeverity.ERROR),
      ];

      autoFixableErrors.forEach(error => {
        const classified = errorClassifier.classifyError(error);
        expect(classified.autoFixable).toBe(true);
      });
    });
  });

  describe('Syntax Error Classification', () => {
    test('should assign highest priority to unexpected token errors', () => {
      const error = createTestError(
        ErrorType.SYNTAX,
        'Unexpected token \'{\'',
        ErrorSeverity.ERROR,
        FixCapability.MANUAL_REQUIRED,
        'components/Form.tsx'
      );

      const classified = errorClassifier.classifyError(error);

      expect(classified.priority).toBe(100); // 95 + 10 boost for syntax errors
      expect(classified.groupId).toBe('syntax-components/Form.tsx-10');
    });

    test('should assign high priority to missing token errors', () => {
      const error = createTestError(
        ErrorType.SYNTAX,
        'Missing closing bracket',
        ErrorSeverity.ERROR,
        FixCapability.MANUAL_REQUIRED,
        'utils/helper.js'
      );

      const classified = errorClassifier.classifyError(error);

      expect(classified.priority).toBe(90);
      expect(classified.groupId).toBe('syntax-utils/helper.js-10');
    });

    test('should assign medium-high priority to expected token errors', () => {
      const error = createTestError(
        ErrorType.SYNTAX,
        'Expected semicolon',
        ErrorSeverity.ERROR,
        FixCapability.AUTO_FIXABLE,
        'config/settings.js'
      );

      const classified = errorClassifier.classifyError(error);

      expect(classified.priority).toBe(85);
      expect(classified.autoFixable).toBe(true);
      expect(classified.groupId).toBe('syntax-config/settings.js-10');
    });

    test('should detect auto-fixable syntax patterns', () => {
      const autoFixableErrors = [
        createTestError(ErrorType.SYNTAX, 'Missing semicolon at end', ErrorSeverity.ERROR),
        createTestError(ErrorType.SYNTAX, 'Missing comma in object', ErrorSeverity.ERROR),
      ];

      autoFixableErrors.forEach(error => {
        const classified = errorClassifier.classifyError(error);
        expect(classified.autoFixable).toBe(true);
      });
    });
  });

  describe('Priority Calculation', () => {
    test('should give warnings lower priority than errors', () => {
      const error = createTestError(
        ErrorType.TYPESCRIPT,
        'Property does not exist',
        ErrorSeverity.ERROR
      );

      const warning = createTestError(
        ErrorType.TYPESCRIPT,
        'Property does not exist',
        ErrorSeverity.WARNING
      );

      const classifiedError = errorClassifier.classifyError(error);
      const classifiedWarning = errorClassifier.classifyError(warning);

      expect(classifiedError.priority).toBeGreaterThan(classifiedWarning.priority);
      expect(classifiedWarning.priority).toBe(60); // 80 - 20 for warning
    });

    test('should boost priority for build-blocking errors', () => {
      const buildError = createTestError(
        ErrorType.BUILD,
        'Regular build error',
        ErrorSeverity.ERROR
      );

      const syntaxError = createTestError(
        ErrorType.SYNTAX,
        'Regular syntax error',
        ErrorSeverity.ERROR
      );

      const runtimeError = createTestError(
        ErrorType.RUNTIME,
        'Regular runtime error',
        ErrorSeverity.ERROR
      );

      const classifiedBuild = errorClassifier.classifyError(buildError);
      const classifiedSyntax = errorClassifier.classifyError(syntaxError);
      const classifiedRuntime = errorClassifier.classifyError(runtimeError);

      expect(classifiedBuild.priority).toBeGreaterThan(classifiedRuntime.priority);
      expect(classifiedSyntax.priority).toBeGreaterThan(classifiedRuntime.priority);
    });

    test('should cap priority at 100 and floor at 1', () => {
      const highPriorityError = createTestError(
        ErrorType.BUILD,
        'Failed to compile',
        ErrorSeverity.ERROR
      );

      const lowPriorityWarning = createTestError(
        ErrorType.ESLINT,
        'Expected indentation',
        ErrorSeverity.WARNING
      );

      const classifiedHigh = errorClassifier.classifyError(highPriorityError);
      const classifiedLow = errorClassifier.classifyError(lowPriorityWarning);

      expect(classifiedHigh.priority).toBeLessThanOrEqual(100);
      expect(classifiedLow.priority).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Error Grouping and Relationships', () => {
    test('should group related TypeScript errors by code', () => {
      const errors = [
        createTestError(ErrorType.TYPESCRIPT, 'Type error 1', ErrorSeverity.ERROR, FixCapability.AUTO_FIXABLE, 'file1.ts', 'TS2322'),
        createTestError(ErrorType.TYPESCRIPT, 'Type error 2', ErrorSeverity.ERROR, FixCapability.AUTO_FIXABLE, 'file2.ts', 'TS2322'),
        createTestError(ErrorType.TYPESCRIPT, 'Different error', ErrorSeverity.ERROR, FixCapability.AUTO_FIXABLE, 'file3.ts', 'TS2339'),
      ];

      const classified = errorClassifier.classifyErrors(errors);

      const group1 = classified.filter(e => e.groupId === 'ts-TS2322');
      const group2 = classified.filter(e => e.groupId === 'ts-TS2339');

      expect(group1).toHaveLength(2);
      expect(group2).toHaveLength(1);

      // Check that errors in group1 reference each other
      expect(group1[0]?.relatedErrors).toContain(group1[1]?.id);
      expect(group1[1]?.relatedErrors).toContain(group1[0]?.id);

      // Check that error in group2 has no related errors
      expect(group2[0]?.relatedErrors).toHaveLength(0);
    });

    test('should group related ESLint errors by rule', () => {
      const errors = [
        createTestError(ErrorType.ESLINT, 'Missing semicolon 1', ErrorSeverity.ERROR, FixCapability.AUTO_FIXABLE, 'file1.js', undefined, 'semi'),
        createTestError(ErrorType.ESLINT, 'Missing semicolon 2', ErrorSeverity.ERROR, FixCapability.AUTO_FIXABLE, 'file2.js', undefined, 'semi'),
        createTestError(ErrorType.ESLINT, 'Indentation error', ErrorSeverity.WARNING, FixCapability.AUTO_FIXABLE, 'file3.js', undefined, 'indent'),
      ];

      const classified = errorClassifier.classifyErrors(errors);

      const semiGroup = classified.filter(e => e.groupId === 'eslint-semi');
      const indentGroup = classified.filter(e => e.groupId === 'eslint-indent');

      expect(semiGroup).toHaveLength(2);
      expect(indentGroup).toHaveLength(1);

      // Check relationships
      expect(semiGroup[0]?.relatedErrors).toContain(semiGroup[1]?.id);
      expect(semiGroup[1]?.relatedErrors).toContain(semiGroup[0]?.id);
      expect(indentGroup[0]?.relatedErrors).toHaveLength(0);
    });

    test('should group build errors by file', () => {
      const errors = [
        createTestError(ErrorType.BUILD, 'Build error 1', ErrorSeverity.ERROR, FixCapability.MANUAL_REQUIRED, 'components/Button.tsx'),
        createTestError(ErrorType.BUILD, 'Build error 2', ErrorSeverity.ERROR, FixCapability.MANUAL_REQUIRED, 'components/Button.tsx'),
        createTestError(ErrorType.BUILD, 'Different file error', ErrorSeverity.ERROR, FixCapability.MANUAL_REQUIRED, 'utils/helper.ts'),
      ];

      const classified = errorClassifier.classifyErrors(errors);

      const buttonGroup = classified.filter(e => e.groupId === 'build-components/Button.tsx');
      const helperGroup = classified.filter(e => e.groupId === 'build-utils/helper.ts');

      expect(buttonGroup).toHaveLength(2);
      expect(helperGroup).toHaveLength(1);

      expect(buttonGroup[0]?.relatedErrors).toContain(buttonGroup[1]?.id);
      expect(helperGroup[0]?.relatedErrors).toHaveLength(0);
    });

    test('should sort errors by priority (highest first)', () => {
      const errors = [
        createTestError(ErrorType.ESLINT, 'Low priority', ErrorSeverity.WARNING, FixCapability.AUTO_FIXABLE), // ~5 priority
        createTestError(ErrorType.TYPESCRIPT, 'Module not found', ErrorSeverity.ERROR, FixCapability.AUTO_FIXABLE), // 90 priority
        createTestError(ErrorType.BUILD, 'Failed to compile', ErrorSeverity.ERROR, FixCapability.MANUAL_REQUIRED), // 100 priority
        createTestError(ErrorType.RUNTIME, 'TypeError', ErrorSeverity.ERROR, FixCapability.MANUAL_REQUIRED), // 85 priority
      ];

      const classified = errorClassifier.classifyErrors(errors);

      expect(classified[0]?.type).toBe(ErrorType.BUILD); // Highest priority
      expect(classified[1]?.type).toBe(ErrorType.TYPESCRIPT);
      expect(classified[2]?.type).toBe(ErrorType.RUNTIME);
      expect(classified[3]?.type).toBe(ErrorType.ESLINT); // Lowest priority
    });
  });

  describe('Default Classification Handling', () => {
    test('should handle unknown error types with default classification', () => {
      const unknownError = createTestError(
        ErrorType.UNKNOWN,
        'Some unknown error',
        ErrorSeverity.ERROR,
        FixCapability.NO_FIX
      );

      const classified = errorClassifier.classifyError(unknownError);

      expect(classified.priority).toBe(50); // Default priority
      expect(classified.autoFixable).toBe(false);
      expect(classified.relatedErrors).toEqual([]);
      expect(classified.suggestedFix).toBeUndefined();
    });

    test('should respect auto-fixable capability from parser for unknown types', () => {
      const autoFixableUnknown = createTestError(
        ErrorType.UNKNOWN,
        'Auto-fixable unknown error',
        ErrorSeverity.ERROR,
        FixCapability.AUTO_FIXABLE
      );

      const classified = errorClassifier.classifyError(autoFixableUnknown);

      expect(classified.autoFixable).toBe(true);
    });
  });

  describe('Fix Suggestion Generation', () => {
    test('should generate appropriate TypeScript fix suggestions', () => {
      const suggestions = [
        {
          error: createTestError(ErrorType.TYPESCRIPT, 'Cannot find module \'lodash\''),
          expectedSuggestion: 'npm install lodash'
        },
        {
          error: createTestError(ErrorType.TYPESCRIPT, 'Property \'name\' does not exist on type \'User\''),
          expectedSuggestion: 'Check property name spelling'
        },
        {
          error: createTestError(ErrorType.TYPESCRIPT, 'Type \'string\' is not assignable to type \'number\''),
          expectedSuggestion: 'Fix type mismatch'
        },
        {
          error: createTestError(ErrorType.TYPESCRIPT, 'Missing return statement in function'),
          expectedSuggestion: 'Add return statement'
        }
      ];

      suggestions.forEach(({ error, expectedSuggestion }) => {
        const classified = errorClassifier.classifyError(error);
        expect(classified.suggestedFix).toContain(expectedSuggestion);
      });
    });

    test('should generate appropriate ESLint fix suggestions', () => {
      const suggestions = [
        {
          error: createTestError(ErrorType.ESLINT, 'Missing semicolon at end of statement'),
          expectedSuggestion: 'Add semicolon'
        },
        {
          error: createTestError(ErrorType.ESLINT, '\'React\' is not defined'),
          expectedSuggestion: 'Import the undefined variable'
        },
        {
          error: createTestError(ErrorType.ESLINT, 'Trailing comma not allowed'),
          expectedSuggestion: 'Remove or add trailing comma'
        },
        {
          error: createTestError(ErrorType.ESLINT, 'Expected indentation of 2 spaces'),
          expectedSuggestion: 'Fix indentation'
        }
      ];

      suggestions.forEach(({ error, expectedSuggestion }) => {
        const classified = errorClassifier.classifyError(error);
        expect(classified.suggestedFix).toContain(expectedSuggestion);
      });
    });

    test('should generate appropriate import fix suggestions', () => {
      const packageError = createTestError(
        ErrorType.IMPORT,
        'Module not found: Can\'t resolve \'axios\''
      );

      const relativeError = createTestError(
        ErrorType.IMPORT,
        'Module not found: Can\'t resolve \'../components/Missing\''
      );

      const packageClassified = errorClassifier.classifyError(packageError);
      const relativeClassified = errorClassifier.classifyError(relativeError);

      expect(packageClassified.suggestedFix).toContain('npm install axios');
      expect(relativeClassified.suggestedFix).toContain('Check file path');
    });

    test('should provide generic suggestions for unmatched patterns', () => {
      const genericTsError = createTestError(
        ErrorType.TYPESCRIPT,
        'Some complex TypeScript error'
      );

      const genericEslintError = createTestError(
        ErrorType.ESLINT,
        'Some complex ESLint error'
      );

      const genericImportError = createTestError(
        ErrorType.IMPORT,
        'Some complex import error'
      );

      const classifiedTs = errorClassifier.classifyError(genericTsError);
      const classifiedEslint = errorClassifier.classifyError(genericEslintError);
      const classifiedImport = errorClassifier.classifyError(genericImportError);

      expect(classifiedTs.suggestedFix).toContain('Review TypeScript error');
      expect(classifiedEslint.suggestedFix).toContain('eslint --fix');
      expect(classifiedImport.suggestedFix).toContain('Fix import path');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle errors without codes or rules gracefully', () => {
      const errorWithoutCode = createTestError(
        ErrorType.TYPESCRIPT,
        'Error without code',
        ErrorSeverity.ERROR,
        FixCapability.MANUAL_REQUIRED,
        'test.ts',
        undefined
      );

      const errorWithoutRule = createTestError(
        ErrorType.ESLINT,
        'Error without rule',
        ErrorSeverity.ERROR,
        FixCapability.MANUAL_REQUIRED,
        'test.js',
        undefined,
        undefined
      );

      const classifiedTs = errorClassifier.classifyError(errorWithoutCode);
      const classifiedEslint = errorClassifier.classifyError(errorWithoutRule);

      expect(classifiedTs.groupId).toBe('ts-unknown');
      expect(classifiedEslint.groupId).toBe('eslint-unknown');
      expect(() => errorClassifier.classifyError(errorWithoutCode)).not.toThrow();
      expect(() => errorClassifier.classifyError(errorWithoutRule)).not.toThrow();
    });

    test('should handle empty error arrays', () => {
      const result = errorClassifier.classifyErrors([]);
      expect(result).toEqual([]);
    });

    test('should handle single error classification', () => {
      const error = createTestError(
        ErrorType.TYPESCRIPT,
        'Single error',
        ErrorSeverity.ERROR
      );

      const result = errorClassifier.classifyErrors([error]);
      expect(result).toHaveLength(1);
      expect(result[0]?.relatedErrors).toHaveLength(0);
    });

    test('should preserve all original error properties', () => {
      const originalError = createTestError(
        ErrorType.TYPESCRIPT,
        'Test error',
        ErrorSeverity.ERROR,
        FixCapability.AUTO_FIXABLE,
        'test.ts',
        'TS2322'
      );

      const classified = errorClassifier.classifyError(originalError);

      expect(classified.id).toBe(originalError.id);
      expect(classified.type).toBe(originalError.type);
      expect(classified.severity).toBe(originalError.severity);
      expect(classified.message).toBe(originalError.message);
      expect(classified.code).toBe(originalError.code);
      expect(classified.location).toEqual(originalError.location);
      expect(classified.fixCapability).toBe(originalError.fixCapability);
      expect(classified.timestamp).toBe(originalError.timestamp);
      expect(classified.raw).toBe(originalError.raw);
      expect(classified.file).toBe(originalError.location.file);
    });
  });
});