/**
 * ErrorClassifier component - classifies and prioritizes errors
 * Assigns priority scores, groups related errors, and determines fix strategies
 */

import { 
  ParsedError, 
  ClassifiedError, 
  ErrorType, 
  ErrorSeverity, 
  FixCapability 
} from '../types/errors';
import { randomUUID } from 'crypto';

export interface IErrorClassifier {
  classifyError(error: ParsedError): ClassifiedError;
  classifyErrors(errors: ParsedError[]): ClassifiedError[];
}

interface ClassificationRule {
  type: ErrorType;
  messagePatternsForPriority: { pattern: RegExp; priority: number }[];
  autoFixablePatterns: RegExp[];
  groupingStrategy: (error: ParsedError) => string;
  suggestedFixGenerator?: (error: ParsedError) => string;
}

export class ErrorClassifier implements IErrorClassifier {
  private classificationRules: ClassificationRule[] = [
    // TypeScript errors
    {
      type: ErrorType.TYPESCRIPT,
      messagePatternsForPriority: [
        { pattern: /Cannot find module|Module .+ not found/, priority: 90 },
        { pattern: /Property .+ does not exist/, priority: 80 },
        { pattern: /Type .+ is not assignable to type/, priority: 70 },
        { pattern: /Missing return statement/, priority: 60 },
        { pattern: /Unused variable|is declared but never read/, priority: 30 },
      ],
      autoFixablePatterns: [
        /Cannot find module/,
        /Unused variable/,
        /Missing return statement in function/,
        /Property .+ does not exist on type .+ Did you mean/,
      ],
      groupingStrategy: (error) => `ts-${error.code || 'unknown'}`,
      suggestedFixGenerator: (error) => this.generateTypeScriptFix(error),
    },

    // ESLint errors  
    {
      type: ErrorType.ESLINT,
      messagePatternsForPriority: [
        { pattern: /is not defined/, priority: 85 },
        { pattern: /Unexpected token/, priority: 80 },
        { pattern: /Missing semicolon/, priority: 20 },
        { pattern: /Trailing comma/, priority: 15 },
        { pattern: /Expected indentation/, priority: 10 },
      ],
      autoFixablePatterns: [
        /Missing semicolon/,
        /Trailing comma/,
        /Expected indentation/,
        /Missing space/,
        /Quotes must be/,
      ],
      groupingStrategy: (error) => `eslint-${error.rule || 'unknown'}`,
      suggestedFixGenerator: (error) => this.generateESLintFix(error),
    },

    // Build errors
    {
      type: ErrorType.BUILD,
      messagePatternsForPriority: [
        { pattern: /Failed to compile/, priority: 95 },
        { pattern: /Module build failed/, priority: 90 },
        { pattern: /SyntaxError/, priority: 85 },
        { pattern: /ReferenceError/, priority: 80 },
      ],
      autoFixablePatterns: [
        /Missing dependency/,
        /Incorrect file extension/,
      ],
      groupingStrategy: (error) => `build-${error.location.file}`,
    },

    // Runtime errors
    {
      type: ErrorType.RUNTIME,
      messagePatternsForPriority: [
        { pattern: /TypeError/, priority: 85 },
        { pattern: /ReferenceError/, priority: 80 },
        { pattern: /Cannot read property/, priority: 75 },
        { pattern: /is not a function/, priority: 70 },
      ],
      autoFixablePatterns: [],
      groupingStrategy: (error) => `runtime-${error.message.split(' ')[0]}`,
    },

    // Import errors
    {
      type: ErrorType.IMPORT,
      messagePatternsForPriority: [
        { pattern: /Module not found/, priority: 90 },
        { pattern: /Cannot resolve/, priority: 85 },
        { pattern: /Invalid import/, priority: 80 },
      ],
      autoFixablePatterns: [
        /Module not found/,
        /Cannot resolve/,
      ],
      groupingStrategy: (error) => `import-${error.location.file}`,
      suggestedFixGenerator: (error) => this.generateImportFix(error),
    },

    // Syntax errors
    {
      type: ErrorType.SYNTAX,
      messagePatternsForPriority: [
        { pattern: /Unexpected token/, priority: 95 },
        { pattern: /Missing/, priority: 80 },
        { pattern: /Expected/, priority: 75 },
      ],
      autoFixablePatterns: [
        /Missing semicolon/,
        /Missing comma/,
      ],
      groupingStrategy: (error) => `syntax-${error.location.file}-${error.location.line}`,
    },
  ];

  classifyError(error: ParsedError): ClassifiedError {
    const rule = this.classificationRules.find(r => r.type === error.type);
    
    if (!rule) {
      return this.createDefaultClassification(error);
    }

    const priority = this.calculatePriority(error, rule);
    const autoFixable = this.isAutoFixable(error, rule);
    const groupId = rule.groupingStrategy(error);
    const suggestedFix = rule.suggestedFixGenerator?.(error);

    return {
      ...error,
      priority,
      groupId,
      relatedErrors: [],
      suggestedFix: suggestedFix || undefined,
      autoFixable,
      file: error.location.file,
    };
  }

  classifyErrors(errors: ParsedError[]): ClassifiedError[] {
    // First, classify each error individually
    const classified = errors.map(error => this.classifyError(error));

    // Then, group related errors and update relationships
    this.groupRelatedErrors(classified);

    // Sort by priority (highest first)
    return classified.sort((a, b) => b.priority - a.priority);
  }

  private calculatePriority(error: ParsedError, rule: ClassificationRule): number {
    // Base priority by severity
    let priority = error.severity === ErrorSeverity.ERROR ? 50 : 25;

    // Apply pattern-based priority adjustments
    for (const priorityRule of rule.messagePatternsForPriority) {
      if (priorityRule.pattern.test(error.message)) {
        priority = Math.max(priority, priorityRule.priority);
        break;
      }
    }

    // Boost priority for build-blocking errors
    if (error.type === ErrorType.BUILD || error.type === ErrorType.SYNTAX) {
      priority += 10;
    }

    // Reduce priority for warnings
    if (error.severity === ErrorSeverity.WARNING) {
      priority = Math.max(1, priority - 20);
    }

    return Math.min(100, Math.max(1, priority));
  }

  private isAutoFixable(error: ParsedError, rule: ClassificationRule): boolean {
    // Check if the error is marked as auto-fixable by the parser
    if (error.fixCapability === FixCapability.AUTO_FIXABLE) {
      return true;
    }

    // Check rule-specific auto-fixable patterns
    return rule.autoFixablePatterns.some(pattern => 
      pattern.test(error.message)
    );
  }

  private groupRelatedErrors(errors: ClassifiedError[]): void {
    const groups = new Map<string, ClassifiedError[]>();

    // Group errors by groupId
    for (const error of errors) {
      if (!error.groupId) continue;
      
      if (!groups.has(error.groupId)) {
        groups.set(error.groupId, []);
      }
      groups.get(error.groupId)!.push(error);
    }

    // Update relatedErrors for each error in groups
    for (const [groupId, groupErrors] of groups) {
      if (groupErrors.length > 1) {
        for (const error of groupErrors) {
          error.relatedErrors = groupErrors
            .filter(e => e.id !== error.id)
            .map(e => e.id);
        }
      }
    }
  }

  private createDefaultClassification(error: ParsedError): ClassifiedError {
    return {
      ...error,
      priority: 50,
      relatedErrors: [],
      autoFixable: error.fixCapability === FixCapability.AUTO_FIXABLE,
      file: error.location.file,
    };
  }

  private generateTypeScriptFix(error: ParsedError): string {
    if (error.message.includes('Cannot find module')) {
      const match = error.message.match(/Cannot find module '([^']+)'/);
      if (match) {
        return `Install missing module: npm install ${match[1]}`;
      }
    }

    if (error.message.includes('Property') && error.message.includes('does not exist')) {
      return 'Check property name spelling or add property to type definition';
    }

    if (error.message.includes('is not assignable to type')) {
      return 'Fix type mismatch by updating type annotations or value';
    }

    if (error.message.includes('Missing return statement')) {
      return 'Add return statement or change function return type to void';
    }

    return 'Review TypeScript error and fix type-related issues';
  }

  private generateESLintFix(error: ParsedError): string {
    if (error.message.includes('Missing semicolon')) {
      return 'Add semicolon at end of statement';
    }

    if (error.message.includes('is not defined')) {
      return 'Import the undefined variable or check spelling';
    }

    if (error.message.includes('Trailing comma')) {
      return 'Remove or add trailing comma according to ESLint config';
    }

    if (error.message.includes('Expected indentation')) {
      return 'Fix indentation to match ESLint configuration';
    }

    return 'Run ESLint auto-fix: eslint --fix';
  }

  private generateImportFix(error: ParsedError): string {
    if (error.message.includes('Module not found')) {
      const match = error.message.match(/Can't resolve '([^']+)'/);
      if (match && match[1]) {
        const module = match[1];
        if (module.startsWith('./') || module.startsWith('../')) {
          return `Check file path: ${module} exists and spelling is correct`;
        } else {
          return `Install missing package: npm install ${module}`;
        }
      }
    }

    return 'Fix import path or install missing dependency';
  }
}