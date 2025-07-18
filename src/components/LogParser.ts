/**
 * LogParser component - parses NextJS development server logs
 * Extracts and categorizes errors from development server output
 */

import { 
  ParsedError, 
  ErrorType, 
  ErrorSeverity, 
  FixCapability, 
  ErrorPattern,
  ErrorLocation 
} from '../types/errors';
import { randomUUID } from 'crypto';

export interface ILogParser {
  parseLogLine(line: string): ParsedError | null;
  parseLogBuffer(buffer: string): ParsedError[];
}

export class LogParser implements ILogParser {
  private patterns: ErrorPattern[] = [
    // TypeScript compilation errors
    {
      type: ErrorType.TYPESCRIPT,
      pattern: /(.+\.tsx?)\((\d+),(\d+)\): error TS(\d+): (.+)/,
      severity: ErrorSeverity.ERROR,
      fixCapability: FixCapability.AUTO_FIXABLE,
      extractor: (match) => ({
        location: {
          file: match[1] || '',
          line: parseInt(match[2] || '0'),
          column: parseInt(match[3] || '0'),
        },
        code: `TS${match[4] || ''}`,
        message: match[5] || '',
      }),
    },

    // TypeScript compilation warnings  
    {
      type: ErrorType.TYPESCRIPT,
      pattern: /(.+\.tsx?)\((\d+),(\d+)\): warning TS(\d+): (.+)/,
      severity: ErrorSeverity.WARNING,
      fixCapability: FixCapability.SUGGESTION_AVAILABLE,
      extractor: (match) => ({
        location: {
          file: match[1] || '',
          line: parseInt(match[2] || '0'),
          column: parseInt(match[3] || '0'),
        },
        code: `TS${match[4] || ''}`,
        message: match[5] || '',
      }),
    },

    // ESLint errors and warnings
    {
      type: ErrorType.ESLINT,
      pattern: /(.+):(\d+):(\d+): (error|warning) (.+) \((.+)\)/,
      severity: ErrorSeverity.ERROR, // Will be overridden by extractor
      fixCapability: FixCapability.AUTO_FIXABLE,
      extractor: (match) => ({
        location: {
          file: match[1] || '',
          line: parseInt(match[2] || '0'),
          column: parseInt(match[3] || '0'),
        },
        severity: match[4] === 'error' ? ErrorSeverity.ERROR : ErrorSeverity.WARNING,
        message: match[5] || '',
        rule: match[6] || undefined,
      }),
    },

    // Next.js build errors
    {
      type: ErrorType.BUILD,
      pattern: /Error: (.+)\n\s+at (.+):(\d+):(\d+)/,
      severity: ErrorSeverity.ERROR,
      fixCapability: FixCapability.MANUAL_REQUIRED,
      extractor: (match) => ({
        message: match[1] || '',
        location: {
          file: match[2] || '',
          line: parseInt(match[3] || '0'),
          column: parseInt(match[4] || '0'),
        },
      }),
    },

    // Runtime errors with stack traces
    {
      type: ErrorType.RUNTIME,
      pattern: /Error: (.+)\s+at .+ \((.+):(\d+):(\d+)\)/,
      severity: ErrorSeverity.ERROR,
      fixCapability: FixCapability.MANUAL_REQUIRED,
      extractor: (match) => ({
        message: match[1] || '',
        location: {
          file: match[2] || '',
          line: parseInt(match[3] || '0'),
          column: parseInt(match[4] || '0'),
        },
      }),
    },

    // Import/Module errors
    {
      type: ErrorType.IMPORT,
      pattern: /Module not found: Can't resolve '(.+)' in '(.+)'/,
      severity: ErrorSeverity.ERROR,
      fixCapability: FixCapability.AUTO_FIXABLE,
      extractor: (match) => ({
        message: `Module not found: Can't resolve '${match[1] || ''}'`,
        location: {
          file: match[2] || '',
          line: 1,
          column: 1,
        },
      }),
    },

    // Syntax errors
    {
      type: ErrorType.SYNTAX,
      pattern: /SyntaxError: (.+) in (.+):(\d+)/,
      severity: ErrorSeverity.ERROR,
      fixCapability: FixCapability.MANUAL_REQUIRED,
      extractor: (match) => ({
        message: match[1] || '',
        location: {
          file: match[2] || '',
          line: parseInt(match[3] || '0'),
          column: 1,
        },
      }),
    },

    // Generic Next.js errors
    {
      type: ErrorType.BUILD,
      pattern: /Failed to compile\.\s*(.+)/,
      severity: ErrorSeverity.ERROR,
      fixCapability: FixCapability.MANUAL_REQUIRED,
      extractor: (match) => ({
        message: match[1] || 'Failed to compile',
        location: {
          file: 'unknown',
          line: 1,
          column: 1,
        },
      }),
    },
  ];

  parseLogLine(line: string): ParsedError | null {
    // Clean the line from ANSI colors and extra whitespace
    const cleanLine = this.cleanLogLine(line);
    
    if (!cleanLine.trim()) {
      return null;
    }

    // Try each pattern to match the error
    for (const pattern of this.patterns) {
      const match = cleanLine.match(pattern.pattern);
      if (match) {
        try {
          const extractedData = pattern.extractor(match);
          return this.createParsedError(pattern, extractedData, cleanLine);
        } catch (error) {
          console.warn('Error extracting data from pattern:', error);
          continue;
        }
      }
    }

    // Check if this looks like an error but didn't match patterns
    if (this.looksLikeError(cleanLine)) {
      return this.createUnknownError(cleanLine);
    }

    return null;
  }

  parseLogBuffer(buffer: string): ParsedError[] {
    const lines = buffer.split('\n');
    const errors: ParsedError[] = [];
    
    for (const line of lines) {
      const error = this.parseLogLine(line);
      if (error) {
        errors.push(error);
      }
    }

    return this.deduplicateErrors(errors);
  }

  private cleanLogLine(line: string): string {
    // Remove ANSI escape codes
    return line.replace(/\x1b\[[0-9;]*m/g, '').trim();
  }

  private looksLikeError(line: string): boolean {
    const errorIndicators = [
      'error',
      'Error:',
      'failed',
      'Failed',
      'exception',
      'Exception:',
      'cannot',
      'Cannot',
      'undefined',
      'null is not',
      'is not defined',
    ];

    const lowerLine = line.toLowerCase();
    return errorIndicators.some(indicator => 
      lowerLine.includes(indicator.toLowerCase())
    );
  }

  private createParsedError(
    pattern: ErrorPattern, 
    extracted: Partial<ParsedError>, 
    rawLine: string
  ): ParsedError {
    return {
      id: randomUUID(),
      type: pattern.type,
      severity: extracted.severity || pattern.severity,
      fixCapability: extracted.fixCapability || pattern.fixCapability,
      message: extracted.message || 'Unknown error',
      code: extracted.code,
      rule: extracted.rule,
      location: extracted.location || {
        file: 'unknown',
        line: 1,
        column: 1,
      },
      timestamp: new Date(),
      raw: rawLine,
    };
  }

  private createUnknownError(line: string): ParsedError {
    return {
      id: randomUUID(),
      type: ErrorType.UNKNOWN,
      severity: ErrorSeverity.ERROR,
      fixCapability: FixCapability.NO_FIX,
      message: line,
      location: {
        file: 'unknown',
        line: 1,
        column: 1,
      },
      timestamp: new Date(),
      raw: line,
    };
  }

  private deduplicateErrors(errors: ParsedError[]): ParsedError[] {
    const seen = new Set<string>();
    return errors.filter(error => {
      // Create a signature based on type, message, and location
      const signature = `${error.type}:${error.message}:${error.location.file}:${error.location.line}`;
      if (seen.has(signature)) {
        return false;
      }
      seen.add(signature);
      return true;
    });
  }
}