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
  code?: string | undefined;
  location: ErrorLocation;
  rule?: string | undefined;
  fixCapability: FixCapability;
  timestamp: Date;
  raw: string;
}

export interface ClassifiedError extends ParsedError {
  priority: number;
  groupId?: string | undefined;
  relatedErrors: string[];
  suggestedFix?: string | undefined;
  autoFixable: boolean;
  // Additional properties for AutoFixer compatibility
  file: string;
}

export interface FixResult {
  success: boolean;
  file: string;
  applied: boolean;
  error?: string | undefined;
  changes?: any;
}

export interface FixStrategy {
  type: 'add_import' | 'add_type_annotation' | 'add_return_type' | 'install_dependency' | 
        'fix_import_extension' | 'fix_nextjs_config' | 'fix_package_json' |
        'fix_property_access' | 'add_type_assertion' | 'add_null_check' | 
        'remove_unused_variable' | 'add_missing_property' | 'fix_module_resolution' |
        // Custom NextJS-specific fix strategies
        'add_use_client_directive' | 'fix_nextjs_app_router' | 'add_api_response' |
        'fix_api_route_handler' | 'add_alt_attribute' | 'add_priority_prop' |
        'convert_to_next_image' | 'fix_hook_dependencies' | 'move_hook_to_component' |
        'fix_hook_usage' | 'add_key_prop' | 'remove_console_statement' |
        'fix_env_variable_usage' | 'fix_strict_mode_types' | 'remove_unused_import';
  target?: string | undefined;
  description: string;
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