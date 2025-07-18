/**
 * Error classification and handling type definitions
 */

export enum ErrorType {
  TYPESCRIPT = 'typescript',
  ESLINT = 'eslint',
  BUILD = 'build',
  RUNTIME = 'runtime',
  IMPORT = 'import',
  SYNTAX = 'syntax',
  UNKNOWN = 'unknown',
}

export enum ErrorSeverity {
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
}

export enum FixCapability {
  AUTO_FIXABLE = 'auto_fixable',
  MANUAL_REQUIRED = 'manual_required',
  SUGGESTION_AVAILABLE = 'suggestion_available',
  NO_FIX = 'no_fix',
}

export interface ErrorLocation {
  file: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

export interface ParsedError {
  id: string;
  type: ErrorType;
  severity: ErrorSeverity;
  message: string;
  code?: string;
  location: ErrorLocation;
  rule?: string;
  fixCapability: FixCapability;
  timestamp: Date;
  raw: string;
}

export interface ClassifiedError extends ParsedError {
  priority: number;
  groupId?: string;
  relatedErrors: string[];
  suggestedFix?: string;
  autoFixable: boolean;
}

export interface FixResult {
  success: boolean;
  errorId: string;
  changes: FileChange[];
  message: string;
  backupPath?: string;
  rollbackAvailable: boolean;
}

export interface FileChange {
  file: string;
  type: 'modified' | 'created' | 'deleted';
  oldContent?: string;
  newContent?: string;
  patch?: string;
}

export interface ErrorPattern {
  type: ErrorType;
  pattern: RegExp;
  severity: ErrorSeverity;
  fixCapability: FixCapability;
  extractor: (match: RegExpMatchArray) => Partial<ParsedError>;
}