/**
 * Auto-Fix System Implementation
 * Provides automated fixes for common development errors
 */

import { ESLint } from 'eslint';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { ClassifiedError, FixResult, FixStrategy } from '../types/errors';
import { MonitorConfig } from '../types/config.js';

export interface IAutoFixer {
  canFix(error: ClassifiedError): boolean;
  applyFix(error: ClassifiedError): Promise<FixResult>;
}

export interface BackupMetadata {
  id: string;
  filePath: string;
  timestamp: Date;
  originalSize: number;
  checksum: string;
  fixType: string;
  description: string;
}

export interface BackupManager {
  createBackup(filePath: string, fixType: string, description: string): Promise<string>;
  restoreBackup(backupId: string): Promise<void>;
  listBackups(filePath?: string): Promise<BackupMetadata[]>;
  cleanupOldBackups(): Promise<void>;
  validateBackup(backupId: string): Promise<boolean>;
}

export class AutoFixer implements IAutoFixer {
  private config: MonitorConfig;
  private eslint?: ESLint;
  private backupDir: string;
  private backupMetadataFile: string;
  private backupMetadata: Map<string, BackupMetadata> = new Map();

  constructor(config: MonitorConfig) {
    this.config = config;
    this.backupDir = path.join(config.projectPath, '.nextjs-monitor-backups');
    this.backupMetadataFile = path.join(this.backupDir, 'metadata.json');
    this.initializeESLint();
    this.loadBackupMetadata();
  }

  private async initializeESLint(): Promise<void> {
    try {
      // Initialize ESLint with auto-fix capability
      this.eslint = new ESLint({
        fix: true,
        cwd: this.config.projectPath,
        allowInlineConfig: true,
      });
    } catch (error) {
      console.warn('ESLint initialization failed:', error);
    }
  }

  /**
   * Load backup metadata from disk
   */
  private async loadBackupMetadata(): Promise<void> {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
      
      const metadataExists = await fs.access(this.backupMetadataFile).then(() => true).catch(() => false);
      if (metadataExists) {
        const data = await fs.readFile(this.backupMetadataFile, 'utf8');
        const parsed = JSON.parse(data);
        
        // Convert timestamp strings back to Date objects
        for (const [id, metadata] of Object.entries(parsed as Record<string, any>)) {
          this.backupMetadata.set(id, {
            ...metadata,
            timestamp: new Date(metadata.timestamp),
          });
        }
      }
    } catch (error) {
      console.warn('Failed to load backup metadata:', error);
    }
  }

  /**
   * Save backup metadata to disk
   */
  private async saveBackupMetadata(): Promise<void> {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
      
      const data = Object.fromEntries(this.backupMetadata.entries());
      await fs.writeFile(this.backupMetadataFile, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      console.warn('Failed to save backup metadata:', error);
    }
  }

  /**
   * Calculate checksum for file content
   */
  private calculateChecksum(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Generate unique backup ID
   */
  private generateBackupId(): string {
    return crypto.randomUUID();
  }

  /**
   * Check if error is auto-fixable
   */
  canFix(error: ClassifiedError): boolean {
    switch (error.type) {
      case 'eslint':
        return !!this.eslint; // ESLint has built-in auto-fix
      case 'typescript':
        return this.getTypeScriptFixStrategy(error) !== null;
      case 'import':
        return this.getImportFixStrategy(error) !== null;
      case 'build':
        return this.getBuildFixStrategy(error) !== null;
      default:
        return this.getCustomFixStrategy(error) !== null;
    }
  }

  /**
   * Apply automatic fix for a classified error
   */
  async applyFix(error: ClassifiedError): Promise<FixResult> {
    // Check safe mode restrictions
    if (this.config.safeMode && !this.canFixInSafeMode(error)) {
      return {
        success: false,
        error: 'Fix blocked by safe mode - requires manual intervention',
        file: error.file,
        applied: false,
      };
    }

    // Generate fix preview in safe mode
    if (this.config.safeMode) {
      const preview = await this.generateFixPreview(error);
      if (!preview.canProceed) {
        return {
          success: false,
          error: `Safe mode prevention: ${preview.reason}`,
          file: error.file,
          applied: false,
        };
      }
    }

    let backupId: string | null = null;
    
    // Create backup if enabled
    if (this.config.backupEnabled) {
      backupId = await this.createEnhancedBackup(
        error.file, 
        error.type, 
        `Fix for ${error.type} error: ${error.message.substring(0, 100)}`
      );
    }

    try {
      const result = await this.applyFixInternal(error);
      
      // If fix was successful, validate the result
      if (result.success && this.config.validateFixes) {
        const validationResult = await this.validateFix(error.file, result);
        if (!validationResult.isValid) {
          // Restore backup if validation fails
          if (backupId) {
            await this.restoreEnhancedBackup(backupId);
          }
          
          return {
            success: false,
            error: `Fix validation failed: ${validationResult.error}`,
            file: error.file,
            applied: false,
          };
        }
      }
      
      return result;
    } catch (fixError) {
      // Restore backup if fix failed
      if (backupId) {
        await this.restoreEnhancedBackup(backupId);
      }
      
      return {
        success: false,
        error: fixError instanceof Error ? fixError.message : 'Unknown fix error',
        file: error.file,
        applied: false,
      };
    }
  }

  /**
   * Internal fix application method
   */
  private async applyFixInternal(error: ClassifiedError): Promise<FixResult> {
    switch (error.type) {
      case 'eslint':
        return await this.applyESLintFix(error);
      case 'typescript':
        return await this.applyTypeScriptFix(error);
      case 'import':
        return await this.applyImportFix(error);
      case 'build':
        return await this.applyBuildFix(error);
      default:
        return await this.applyCustomFix(error);
    }
  }

  /**
   * Apply ESLint auto-fixes
   */
  private async applyESLintFix(error: ClassifiedError): Promise<FixResult> {
    if (!this.eslint) {
      return {
        success: false,
        error: 'ESLint not available',
        file: error.file,
        applied: false,
      };
    }

    try {
      // Lint the specific file with auto-fix
      const results = await this.eslint.lintFiles([error.file]);
      
      if (results.length === 0) {
        return {
          success: false,
          error: 'No ESLint results for file',
          file: error.file,
          applied: false,
        };
      }

      const result = results[0];
      
      if (!result) {
        return {
          success: false,
          error: 'No ESLint result data',
          file: error.file,
          applied: false,
        };
      }
      
      // Apply fixes if available
      if (result.output) {
        await fs.writeFile(error.file, result.output, 'utf8');
        
        return {
          success: true,
          file: error.file,
          applied: true,
          changes: {
            type: 'eslint_autofix',
            fixesApplied: (result.fixableErrorCount || 0) + (result.fixableWarningCount || 0),
            remainingIssues: (result.errorCount || 0) + (result.warningCount || 0) - 
                           (result.fixableErrorCount || 0) - (result.fixableWarningCount || 0),
          },
        };
      }

      return {
        success: false,
        error: 'No auto-fixes available for this ESLint error',
        file: error.file,
        applied: false,
      };

    } catch (eslintError) {
      return {
        success: false,
        error: eslintError instanceof Error ? eslintError.message : 'ESLint error',
        file: error.file,
        applied: false,
      };
    }
  }

  /**
   * Apply TypeScript error fixes
   */
  private async applyTypeScriptFix(error: ClassifiedError): Promise<FixResult> {
    const strategy = this.getTypeScriptFixStrategy(error);
    
    if (!strategy) {
      return {
        success: false,
        error: 'No automatic fix available for this TypeScript error',
        file: error.file,
        applied: false,
      };
    }

    return await this.applyFixStrategy(error, strategy);
  }

  /**
   * Apply import statement fixes
   */
  private async applyImportFix(error: ClassifiedError): Promise<FixResult> {
    const strategy = this.getImportFixStrategy(error);
    
    if (!strategy) {
      return {
        success: false,
        error: 'No automatic fix available for this import error',
        file: error.file,
        applied: false,
      };
    }

    return await this.applyFixStrategy(error, strategy);
  }

  /**
   * Apply build error fixes
   */
  private async applyBuildFix(error: ClassifiedError): Promise<FixResult> {
    const strategy = this.getBuildFixStrategy(error);
    
    if (!strategy) {
      return {
        success: false,
        error: 'No automatic fix available for this build error',
        file: error.file,
        applied: false,
      };
    }

    return await this.applyFixStrategy(error, strategy);
  }

  /**
   * Apply custom fix strategies
   */
  private async applyCustomFix(error: ClassifiedError): Promise<FixResult> {
    const strategy = this.getCustomFixStrategy(error);
    
    if (!strategy) {
      return {
        success: false,
        error: 'No automatic fix available for this error type',
        file: error.file,
        applied: false,
      };
    }

    return await this.applyFixStrategy(error, strategy);
  }

  /**
   * Get TypeScript fix strategy based on error pattern
   */
  private getTypeScriptFixStrategy(error: ClassifiedError): FixStrategy | null {
    const message = error.message.toLowerCase();

    // Missing import fix
    if (message.includes('cannot find name') || message.includes('is not defined')) {
      const match = error.message.match(/Cannot find name '([^']+)'/i);
      if (match) {
        return {
          type: 'add_import',
          target: match[1],
          description: `Add import for '${match[1]}'`,
        };
      }
    }

    // Type annotation fix
    if (message.includes('parameter') && message.includes('implicitly has an \'any\' type')) {
      return {
        type: 'add_type_annotation',
        description: 'Add explicit type annotation for parameter',
      };
    }

    // Missing return type
    if (message.includes('function') && (message.includes('return type') || message.includes('implicitly has an \'any\' return type'))) {
      return {
        type: 'add_return_type',
        description: 'Add explicit return type annotation',
      };
    }

    // Property does not exist on type
    if (message.includes('property') && message.includes('does not exist on type')) {
      const propertyMatch = error.message.match(/Property '([^']+)' does not exist on type/i);
      if (propertyMatch) {
        return {
          type: 'fix_property_access',
          target: propertyMatch[1],
          description: `Fix property access for '${propertyMatch[1]}'`,
        };
      }
    }

    // Type assertion needed
    if (message.includes('type assertion') || message.includes('could be instantiated with a different subtype')) {
      return {
        type: 'add_type_assertion',
        description: 'Add type assertion to resolve type mismatch',
      };
    }

    // Missing null check
    if (message.includes('object is possibly \'null\'') || message.includes('object is possibly \'undefined\'')) {
      return {
        type: 'add_null_check',
        description: 'Add null/undefined check',
      };
    }

    // Unused variable
    if (message.includes('is declared but never used') || message.includes('unused')) {
      return {
        type: 'remove_unused_variable',
        description: 'Remove unused variable declaration',
      };
    }

    // Interface property mismatch
    if (message.includes('is missing in type') && message.includes('but required in type')) {
      const propertyMatch = error.message.match(/Property '([^']+)' is missing in type/i);
      if (propertyMatch) {
        return {
          type: 'add_missing_property',
          target: propertyMatch[1],
          description: `Add missing property '${propertyMatch[1]}'`,
        };
      }
    }

    // Module resolution
    if (message.includes('module') && (message.includes('cannot be resolved') || message.includes('could not be resolved'))) {
      const moduleMatch = error.message.match(/Module '([^']+)'/i);
      if (moduleMatch) {
        return {
          type: 'fix_module_resolution',
          target: moduleMatch[1],
          description: `Fix module resolution for '${moduleMatch[1]}'`,
        };
      }
    }

    return null;
  }

  /**
   * Get import fix strategy based on error pattern
   */
  private getImportFixStrategy(error: ClassifiedError): FixStrategy | null {
    const message = error.message.toLowerCase();

    // Module not found
    if (message.includes('module not found') || message.includes('cannot resolve module')) {
      const match = error.message.match(/Cannot resolve module '([^']+)'/);
      if (match) {
        return {
          type: 'install_dependency',
          target: match[1],
          description: `Install missing dependency '${match[1]}'`,
        };
      }
    }

    // Relative import path fix
    if (message.includes('file extension') || message.includes('.js extension')) {
      return {
        type: 'fix_import_extension',
        description: 'Fix import file extension',
      };
    }

    return null;
  }

  /**
   * Get build fix strategy based on error pattern
   */
  private getBuildFixStrategy(error: ClassifiedError): FixStrategy | null {
    const message = error.message.toLowerCase();

    // Next.js configuration issues
    if (message.includes('next.config')) {
      return {
        type: 'fix_nextjs_config',
        description: 'Fix Next.js configuration',
      };
    }

    // Package.json issues
    if (message.includes('package.json')) {
      return {
        type: 'fix_package_json',
        description: 'Fix package.json configuration',
      };
    }

    return null;
  }

  /**
   * Get custom fix strategy for project-specific patterns
   */
  private getCustomFixStrategy(error: ClassifiedError): FixStrategy | null {
    const message = error.message.toLowerCase();
    const filePath = error.file.toLowerCase();

    // NextJS App Router Issues
    if (this.isNextJSAppRouterIssue(error)) {
      return this.getNextJSAppRouterFix(error);
    }

    // NextJS Client Component Issues
    if (this.isClientComponentIssue(error)) {
      return this.getClientComponentFix(error);
    }

    // NextJS API Route Issues
    if (this.isAPIRouteIssue(error)) {
      return this.getAPIRouteFix(error);
    }

    // NextJS Image Optimization Issues
    if (this.isImageOptimizationIssue(error)) {
      return this.getImageOptimizationFix(error);
    }

    // React Hook Issues
    if (this.isReactHookIssue(error)) {
      return this.getReactHookFix(error);
    }

    // Missing Key Props
    if (this.isMissingKeyPropIssue(error)) {
      return this.getMissingKeyPropFix(error);
    }

    // Console Statement Issues
    if (this.isConsoleStatementIssue(error)) {
      return this.getConsoleStatementFix(error);
    }

    // Environment Variable Issues
    if (this.isEnvironmentVariableIssue(error)) {
      return this.getEnvironmentVariableFix(error);
    }

    // Common TypeScript Strict Mode Issues
    if (this.isStrictModeIssue(error)) {
      return this.getStrictModeFix(error);
    }

    // Unused Import Issues
    if (this.isUnusedImportIssue(error)) {
      return this.getUnusedImportFix(error);
    }

    return null;
  }

  /**
   * Check if error is related to NextJS App Router
   */
  private isNextJSAppRouterIssue(error: ClassifiedError): boolean {
    const message = error.message.toLowerCase();
    const filePath = error.file.toLowerCase();

    return (
      filePath.includes('/app/') &&
      (
        message.includes('cannot use router') ||
        message.includes('userouter is not defined') ||
        message.includes('use client') ||
        message.includes('server component') ||
        message.includes('client component')
      )
    );
  }

  /**
   * Get NextJS App Router fix strategy
   */
  private getNextJSAppRouterFix(error: ClassifiedError): FixStrategy {
    const message = error.message.toLowerCase();

    if (message.includes('userouter') || message.includes('router') || message.includes('use client')) {
      return {
        type: 'add_use_client_directive',
        description: 'Add "use client" directive for client-side router usage',
      };
    }

    return {
      type: 'fix_nextjs_app_router',
      description: 'Fix NextJS App Router usage pattern',
    };
  }

  /**
   * Check if error is related to client component usage
   */
  private isClientComponentIssue(error: ClassifiedError): boolean {
    const message = error.message.toLowerCase();

    return (
      message.includes('usestate') ||
      message.includes('useeffect') ||
      message.includes('onclick') ||
      message.includes('event handler') ||
      message.includes('use client') ||
      message.includes('browser api')
    );
  }

  /**
   * Get client component fix strategy
   */
  private getClientComponentFix(error: ClassifiedError): FixStrategy {
    return {
      type: 'add_use_client_directive',
      description: 'Add "use client" directive for client-side features',
    };
  }

  /**
   * Check if error is related to NextJS API routes
   */
  private isAPIRouteIssue(error: ClassifiedError): boolean {
    const message = error.message.toLowerCase();
    const filePath = error.file.toLowerCase();

    return (
      filePath.includes('/api/') &&
      (
        message.includes('response') ||
        message.includes('request') ||
        message.includes('res.') ||
        message.includes('req.') ||
        message.includes('nextapiresponse') ||
        message.includes('nextapirequest')
      )
    );
  }

  /**
   * Get API route fix strategy
   */
  private getAPIRouteFix(error: ClassifiedError): FixStrategy {
    const message = error.message.toLowerCase();

    if (message.includes('missing return') || message.includes('response')) {
      return {
        type: 'add_api_response',
        description: 'Add proper API response handling',
      };
    }

    return {
      type: 'fix_api_route_handler',
      description: 'Fix NextJS API route handler pattern',
    };
  }

  /**
   * Check if error is related to NextJS Image optimization
   */
  private isImageOptimizationIssue(error: ClassifiedError): boolean {
    const message = error.message.toLowerCase();

    return (
      message.includes('next/image') ||
      message.includes('image') && message.includes('optimization') ||
      message.includes('img') && message.includes('tag') ||
      message.includes('priority') ||
      message.includes('alt') && message.includes('attribute')
    );
  }

  /**
   * Get Image optimization fix strategy
   */
  private getImageOptimizationFix(error: ClassifiedError): FixStrategy {
    const message = error.message.toLowerCase();

    if (message.includes('alt')) {
      return {
        type: 'add_alt_attribute',
        description: 'Add alt attribute to image component',
      };
    }

    if (message.includes('priority')) {
      return {
        type: 'add_priority_prop',
        description: 'Add priority prop to above-fold images',
      };
    }

    return {
      type: 'convert_to_next_image',
      description: 'Convert img tag to Next.js Image component',
    };
  }

  /**
   * Check if error is related to React Hooks
   */
  private isReactHookIssue(error: ClassifiedError): boolean {
    const message = error.message.toLowerCase();

    return (
      message.includes('hook') ||
      message.includes('useeffect') ||
      message.includes('usestate') ||
      message.includes('dependency array') ||
      message.includes('exhaustive-deps')
    );
  }

  /**
   * Get React Hook fix strategy
   */
  private getReactHookFix(error: ClassifiedError): FixStrategy {
    const message = error.message.toLowerCase();

    if (message.includes('dependency') || message.includes('exhaustive-deps')) {
      return {
        type: 'fix_hook_dependencies',
        description: 'Fix useEffect dependency array',
      };
    }

    if (message.includes('hook') && message.includes('component')) {
      return {
        type: 'move_hook_to_component',
        description: 'Move hook usage inside React component',
      };
    }

    return {
      type: 'fix_hook_usage',
      description: 'Fix React Hook usage pattern',
    };
  }

  /**
   * Check if error is related to missing key props
   */
  private isMissingKeyPropIssue(error: ClassifiedError): boolean {
    const message = error.message.toLowerCase();

    return (
      message.includes('key') && message.includes('prop') ||
      message.includes('unique') && message.includes('key') ||
      message.includes('list') && message.includes('key')
    );
  }

  /**
   * Get missing key prop fix strategy
   */
  private getMissingKeyPropFix(error: ClassifiedError): FixStrategy {
    return {
      type: 'add_key_prop',
      description: 'Add unique key prop to list items',
    };
  }

  /**
   * Check if error is related to console statements
   */
  private isConsoleStatementIssue(error: ClassifiedError): boolean {
    const message = error.message.toLowerCase();

    return (
      message.includes('console') ||
      message.includes('no-console') ||
      message.includes('unexpected console statement')
    );
  }

  /**
   * Get console statement fix strategy
   */
  private getConsoleStatementFix(error: ClassifiedError): FixStrategy {
    return {
      type: 'remove_console_statement',
      description: 'Remove console statement for production',
    };
  }

  /**
   * Check if error is related to environment variables
   */
  private isEnvironmentVariableIssue(error: ClassifiedError): boolean {
    const message = error.message.toLowerCase();

    return (
      message.includes('process.env') ||
      message.includes('environment variable') ||
      message.includes('next_public_') ||
      message.includes('env variable')
    );
  }

  /**
   * Get environment variable fix strategy
   */
  private getEnvironmentVariableFix(error: ClassifiedError): FixStrategy {
    return {
      type: 'fix_env_variable_usage',
      description: 'Fix environment variable usage pattern',
    };
  }

  /**
   * Check if error is related to TypeScript strict mode
   */
  private isStrictModeIssue(error: ClassifiedError): boolean {
    const message = error.message.toLowerCase();

    return (
      message.includes('strict mode') ||
      message.includes('exactoptionalpropertytypes') ||
      message.includes('optional property') ||
      message.includes('undefined') && message.includes('type')
    );
  }

  /**
   * Get strict mode fix strategy
   */
  private getStrictModeFix(error: ClassifiedError): FixStrategy {
    return {
      type: 'fix_strict_mode_types',
      description: 'Fix TypeScript strict mode type issues',
    };
  }

  /**
   * Check if error is related to unused imports
   */
  private isUnusedImportIssue(error: ClassifiedError): boolean {
    const message = error.message.toLowerCase();

    return (
      message.includes('unused import') ||
      message.includes('is imported but never used') ||
      message.includes('no-unused-imports')
    );
  }

  /**
   * Get unused import fix strategy
   */
  private getUnusedImportFix(error: ClassifiedError): FixStrategy {
    return {
      type: 'remove_unused_import',
      description: 'Remove unused import statement',
    };
  }

  /**
   * Apply a specific fix strategy
   */
  private async applyFixStrategy(error: ClassifiedError, strategy: FixStrategy): Promise<FixResult> {
    try {
      switch (strategy.type) {
        case 'add_import':
          return await this.addImportStatement(error, strategy.target || '');
        case 'add_type_annotation':
          return await this.addTypeAnnotation(error);
        case 'add_return_type':
          return await this.addReturnType(error);
        case 'install_dependency':
          return await this.installDependency(strategy.target || '');
        case 'fix_import_extension':
          return await this.fixImportExtension(error);
        case 'fix_nextjs_config':
          return await this.fixNextJSConfig(error);
        case 'fix_package_json':
          return await this.fixPackageJson(error);
        case 'fix_property_access':
          return await this.fixPropertyAccess(error, strategy.target || '');
        case 'add_type_assertion':
          return await this.addTypeAssertion(error);
        case 'add_null_check':
          return await this.addNullCheck(error);
        case 'remove_unused_variable':
          return await this.removeUnusedVariable(error);
        case 'add_missing_property':
          return await this.addMissingProperty(error, strategy.target || '');
        case 'fix_module_resolution':
          return await this.fixModuleResolution(error, strategy.target || '');
        // Custom NextJS-specific fixes
        case 'add_use_client_directive':
          return await this.addUseClientDirective(error);
        case 'fix_nextjs_app_router':
          return await this.fixNextJSAppRouter(error);
        case 'add_api_response':
          return await this.addAPIResponse(error);
        case 'fix_api_route_handler':
          return await this.fixAPIRouteHandler(error);
        case 'add_alt_attribute':
          return await this.addAltAttribute(error);
        case 'add_priority_prop':
          return await this.addPriorityProp(error);
        case 'convert_to_next_image':
          return await this.convertToNextImage(error);
        case 'fix_hook_dependencies':
          return await this.fixHookDependencies(error);
        case 'move_hook_to_component':
          return await this.moveHookToComponent(error);
        case 'fix_hook_usage':
          return await this.fixHookUsage(error);
        case 'add_key_prop':
          return await this.addKeyProp(error);
        case 'remove_console_statement':
          return await this.removeConsoleStatement(error);
        case 'fix_env_variable_usage':
          return await this.fixEnvVariableUsage(error);
        case 'fix_strict_mode_types':
          return await this.fixStrictModeTypes(error);
        case 'remove_unused_import':
          return await this.removeUnusedImport(error);
        default:
          return {
            success: false,
            error: `Unknown fix strategy: ${strategy.type}`,
            file: error.file,
            applied: false,
          };
      }
    } catch (strategyError) {
      return {
        success: false,
        error: strategyError instanceof Error ? strategyError.message : 'Strategy application failed',
        file: error.file,
        applied: false,
      };
    }
  }

  /**
   * Add import statement to file
   */
  private async addImportStatement(error: ClassifiedError, target: string): Promise<FixResult> {
    const content = await fs.readFile(error.file, 'utf8');
    const lines = content.split('\n');
    
    // Find appropriate location for import (after existing imports)
    let insertIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line && (line.trim().startsWith('import ') || line.trim().startsWith('const '))) {
        insertIndex = i + 1;
      } else if (line && line.trim() === '') {
        continue;
      } else {
        break;
      }
    }

    // Add the import statement
    const importStatement = this.generateImportStatement(target);
    lines.splice(insertIndex, 0, importStatement);
    
    await fs.writeFile(error.file, lines.join('\n'), 'utf8');
    
    return {
      success: true,
      file: error.file,
      applied: true,
      changes: {
        type: 'add_import',
        import: importStatement,
        insertedAt: insertIndex + 1,
      },
    };
  }

  /**
   * Generate appropriate import statement for target
   */
  private generateImportStatement(target: string): string {
    // Common import patterns
    const commonImports: Record<string, string> = {
      'React': "import React from 'react';",
      'useState': "import { useState } from 'react';",
      'useEffect': "import { useEffect } from 'react';",
      'NextApiRequest': "import type { NextApiRequest, NextApiResponse } from 'next';",
      'NextApiResponse': "import type { NextApiRequest, NextApiResponse } from 'next';",
    };

    return commonImports[target] || `import { ${target} } from '${target}';`;
  }

  /**
   * Add type annotation to function parameter
   */
  private async addTypeAnnotation(error: ClassifiedError): Promise<FixResult> {
    try {
      const content = await fs.readFile(error.file, 'utf8');
      const lines = content.split('\n');
      const errorLine = lines[error.location.line - 1];
      
      if (!errorLine) {
        return {
          success: false,
          error: 'Could not find error line',
          file: error.file,
          applied: false,
        };
      }

      // Check for common patterns
      const parameterMatch = error.message.match(/Parameter '([^']+)' implicitly has an 'any' type/);
      if (parameterMatch && parameterMatch[1]) {
        const paramName = parameterMatch[1];
        const updatedLine = this.addParameterType(errorLine, paramName);
        
        if (updatedLine !== errorLine) {
          lines[error.location.line - 1] = updatedLine;
          await fs.writeFile(error.file, lines.join('\n'), 'utf8');
          
          return {
            success: true,
            file: error.file,
            applied: true,
            changes: {
              type: 'add_parameter_type',
              parameter: paramName,
              lineNumber: error.location.line,
            },
          };
        }
      }

      return {
        success: false,
        error: 'Could not determine appropriate type annotation',
        file: error.file,
        applied: false,
      };
    } catch (typeError) {
      return {
        success: false,
        error: typeError instanceof Error ? typeError.message : 'Type annotation failed',
        file: error.file,
        applied: false,
      };
    }
  }

  /**
   * Add return type to function
   */
  private async addReturnType(error: ClassifiedError): Promise<FixResult> {
    try {
      const content = await fs.readFile(error.file, 'utf8');
      const lines = content.split('\n');
      const errorLine = lines[error.location.line - 1];
      
      if (!errorLine) {
        return {
          success: false,
          error: 'Could not find error line',
          file: error.file,
          applied: false,
        };
      }

      // Check for function declaration patterns
      const functionMatch = errorLine.match(/(function\s+\w+\s*\([^)]*\))\s*(\{|$)/);
      const arrowFunctionMatch = errorLine.match(/(\w+\s*=\s*\([^)]*\)\s*=>\s*)(\{|[^{])/);
      
      if (functionMatch && functionMatch[1]) {
        const updatedLine = errorLine.replace(functionMatch[1], `${functionMatch[1]}: any`);
        lines[error.location.line - 1] = updatedLine;
        await fs.writeFile(error.file, lines.join('\n'), 'utf8');
        
        return {
          success: true,
          file: error.file,
          applied: true,
          changes: {
            type: 'add_return_type',
            returnType: 'any',
            lineNumber: error.location.line,
          },
        };
      } else if (arrowFunctionMatch && arrowFunctionMatch[1]) {
        const updatedLine = errorLine.replace(arrowFunctionMatch[1], `${arrowFunctionMatch[1].trim()}: any => `);
        lines[error.location.line - 1] = updatedLine;
        await fs.writeFile(error.file, lines.join('\n'), 'utf8');
        
        return {
          success: true,
          file: error.file,
          applied: true,
          changes: {
            type: 'add_return_type',
            returnType: 'any',
            lineNumber: error.location.line,
          },
        };
      }

      return {
        success: false,
        error: 'Could not identify function pattern for return type',
        file: error.file,
        applied: false,
      };
    } catch (returnTypeError) {
      return {
        success: false,
        error: returnTypeError instanceof Error ? returnTypeError.message : 'Return type addition failed',
        file: error.file,
        applied: false,
      };
    }
  }

  /**
   * Add parameter type annotation to a function
   */
  private addParameterType(line: string, paramName: string): string {
    // Common parameter type patterns
    const patterns = [
      // Function declaration: function foo(param)
      new RegExp(`(function\\s+\\w+\\s*\\([^)]*\\b${paramName}\\b)([^:,)]*)(\\)|,)`, 'g'),
      // Arrow function: (param) =>
      new RegExp(`(\\([^)]*\\b${paramName}\\b)([^:,)]*)(\\)|,)`, 'g'),
      // Method: methodName(param)
      new RegExp(`(\\w+\\s*\\([^)]*\\b${paramName}\\b)([^:,)]*)(\\)|,)`, 'g'),
    ];

    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        // Determine appropriate type based on context
        const typeAnnotation = this.inferParameterType(paramName, line);
        return line.replace(pattern, `$1: ${typeAnnotation}$3`);
      }
    }

    return line;
  }

  /**
   * Infer appropriate type for parameter based on context
   */
  private inferParameterType(paramName: string, context: string): string {
    // Basic type inference based on parameter name and context
    const namePatterns: Record<string, string> = {
      'id': 'string',
      'index': 'number',
      'count': 'number',
      'size': 'number',
      'length': 'number',
      'width': 'number',
      'height': 'number',
      'callback': 'Function',
      'handler': 'Function',
      'fn': 'Function',
      'event': 'Event',
      'e': 'Event',
      'error': 'Error',
      'err': 'Error',
      'data': 'any',
      'config': 'any',
      'options': 'any',
      'props': 'any',
    };

    // Check for exact matches
    const exactMatch = namePatterns[paramName.toLowerCase()];
    if (exactMatch) {
      return exactMatch;
    }

    // Check for partial matches
    const lowerName = paramName.toLowerCase();
    if (lowerName.includes('id') || lowerName.includes('name') || lowerName.includes('path')) {
      return 'string';
    }
    if (lowerName.includes('count') || lowerName.includes('index') || lowerName.includes('num')) {
      return 'number';
    }
    if (lowerName.includes('flag') || lowerName.includes('is') || lowerName.includes('has')) {
      return 'boolean';
    }
    if (lowerName.includes('callback') || lowerName.includes('handler') || lowerName.includes('fn')) {
      return 'Function';
    }
    if (lowerName.includes('event')) {
      return 'Event';
    }
    if (lowerName.includes('element') || lowerName.includes('node')) {
      return 'HTMLElement';
    }

    // Context-based inference
    if (context.includes('addEventListener') || context.includes('onClick')) {
      return 'Event';
    }
    if (context.includes('document.') || context.includes('element.')) {
      return 'HTMLElement';
    }
    if (context.includes('JSON.parse') || context.includes('fetch')) {
      return 'any';
    }

    // Default to 'any' for safety
    return 'any';
  }

  /**
   * Install missing dependency
   */
  private async installDependency(target: string): Promise<FixResult> {
    return {
      success: false,
      error: 'Dependency installation requires user confirmation',
      file: '',
      applied: false,
    };
  }

  /**
   * Fix import file extension
   */
  private async fixImportExtension(error: ClassifiedError): Promise<FixResult> {
    const content = await fs.readFile(error.file, 'utf8');
    const updated = content.replace(
      /from ['"]([^'"]+)['"];/g,
      (match, importPath) => {
        if (!importPath.includes('.') && !importPath.startsWith('.')) {
          return match; // Keep package imports as-is
        }
        if (importPath.endsWith('.js') || importPath.endsWith('.ts') || importPath.endsWith('.tsx')) {
          return match; // Already has extension
        }
        return match.replace(importPath, `${importPath}.js`);
      }
    );

    if (updated !== content) {
      await fs.writeFile(error.file, updated, 'utf8');
      return {
        success: true,
        file: error.file,
        applied: true,
        changes: {
          type: 'fix_import_extension',
          description: 'Added .js extension to relative imports',
        },
      };
    }

    return {
      success: false,
      error: 'No import extensions to fix',
      file: error.file,
      applied: false,
    };
  }

  /**
   * Fix Next.js configuration issues
   */
  private async fixNextJSConfig(error: ClassifiedError): Promise<FixResult> {
    return {
      success: false,
      error: 'Next.js config fixes require manual intervention',
      file: error.file,
      applied: false,
    };
  }

  /**
   * Fix package.json issues
   */
  private async fixPackageJson(error: ClassifiedError): Promise<FixResult> {
    return {
      success: false,
      error: 'Package.json fixes require manual intervention',
      file: error.file,
      applied: false,
    };
  }

  /**
   * Create enhanced backup with metadata tracking
   */
  private async createEnhancedBackup(filePath: string, fixType: string, description: string): Promise<string> {
    try {
      // Read original file content
      const content = await fs.readFile(filePath, 'utf8');
      const stats = await fs.stat(filePath);
      
      // Generate backup metadata
      const backupId = this.generateBackupId();
      const timestamp = new Date();
      const checksum = this.calculateChecksum(content);
      
      // Create backup filename
      const relativePath = path.relative(this.config.projectPath, filePath);
      const safeFileName = relativePath.replace(/[/\\]/g, '_');
      const backupFileName = `${safeFileName}.${timestamp.toISOString().replace(/[:.]/g, '-')}.${backupId}.backup`;
      const backupPath = path.join(this.backupDir, backupFileName);

      // Ensure backup directory exists
      await fs.mkdir(this.backupDir, { recursive: true });
      
      // Copy file to backup location
      await fs.copyFile(filePath, backupPath);
      
      // Create and store metadata
      const metadata: BackupMetadata = {
        id: backupId,
        filePath,
        timestamp,
        originalSize: stats.size,
        checksum,
        fixType,
        description,
      };
      
      this.backupMetadata.set(backupId, metadata);
      await this.saveBackupMetadata();
      
      return backupId;
    } catch (error) {
      console.warn('Failed to create backup:', error);
      throw error;
    }
  }

  /**
   * Restore file from backup using backup ID
   */
  private async restoreEnhancedBackup(backupId: string): Promise<void> {
    try {
      const metadata = this.backupMetadata.get(backupId);
      if (!metadata) {
        throw new Error(`Backup ${backupId} not found in metadata`);
      }
      
      // Find backup file
      const backupFiles = await fs.readdir(this.backupDir);
      const backupFile = backupFiles.find(file => file.includes(backupId));
      
      if (!backupFile) {
        throw new Error(`Backup file for ${backupId} not found`);
      }
      
      const backupPath = path.join(this.backupDir, backupFile);
      
      // Validate backup integrity before restore
      const isValid = await this.validateBackup(backupId);
      if (!isValid) {
        throw new Error(`Backup ${backupId} failed integrity check`);
      }
      
      // Restore file
      await fs.copyFile(backupPath, metadata.filePath);
      
      console.log(`Restored ${metadata.filePath} from backup ${backupId}`);
    } catch (error) {
      console.warn('Failed to restore backup:', error);
      throw error;
    }
  }

  /**
   * List all backups for a specific file or all files
   */
  async listBackups(filePath?: string): Promise<BackupMetadata[]> {
    const backups = Array.from(this.backupMetadata.values());
    
    if (filePath) {
      return backups.filter(backup => backup.filePath === filePath);
    }
    
    return backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Validate backup integrity
   */
  async validateBackup(backupId: string): Promise<boolean> {
    try {
      const metadata = this.backupMetadata.get(backupId);
      if (!metadata) {
        return false;
      }
      
      // Find backup file
      const backupFiles = await fs.readdir(this.backupDir);
      const backupFile = backupFiles.find(file => file.includes(backupId));
      
      if (!backupFile) {
        return false;
      }
      
      const backupPath = path.join(this.backupDir, backupFile);
      
      // Check if file exists and is readable
      const stats = await fs.stat(backupPath);
      if (!stats.isFile()) {
        return false;
      }
      
      // Verify checksum
      const content = await fs.readFile(backupPath, 'utf8');
      const currentChecksum = this.calculateChecksum(content);
      
      return currentChecksum === metadata.checksum;
    } catch (error) {
      console.warn(`Failed to validate backup ${backupId}:`, error);
      return false;
    }
  }

  /**
   * Clean up old backups based on retention policy
   */
  async cleanupOldBackups(): Promise<void> {
    try {
      const retentionDays = this.config.backupRetentionDays || 7;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      
      const backupsToDelete: string[] = [];
      
      for (const [backupId, metadata] of this.backupMetadata.entries()) {
        if (metadata.timestamp < cutoffDate) {
          backupsToDelete.push(backupId);
        }
      }
      
      // Delete old backup files and metadata
      for (const backupId of backupsToDelete) {
        try {
          const backupFiles = await fs.readdir(this.backupDir);
          const backupFile = backupFiles.find(file => file.includes(backupId));
          
          if (backupFile) {
            const backupPath = path.join(this.backupDir, backupFile);
            await fs.unlink(backupPath);
          }
          
          this.backupMetadata.delete(backupId);
        } catch (error) {
          console.warn(`Failed to delete backup ${backupId}:`, error);
        }
      }
      
      if (backupsToDelete.length > 0) {
        await this.saveBackupMetadata();
        console.log(`Cleaned up ${backupsToDelete.length} old backups`);
      }
    } catch (error) {
      console.warn('Failed to cleanup old backups:', error);
    }
  }

  /**
   * Validate that a fix doesn't break syntax or compilation
   */
  private async validateFix(filePath: string, fixResult: FixResult): Promise<{ isValid: boolean; error?: string }> {
    try {
      // 1. Basic syntax validation
      const syntaxValidation = await this.validateSyntax(filePath);
      if (!syntaxValidation.isValid) {
        return { isValid: false, error: `Syntax error: ${syntaxValidation.error}` };
      }

      // 2. TypeScript compilation check
      if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
        const tsValidation = await this.validateTypeScript(filePath);
        if (!tsValidation.isValid) {
          return { isValid: false, error: `TypeScript error: ${tsValidation.error}` };
        }
      }

      // 3. ESLint validation
      if (this.eslint) {
        const lintValidation = await this.validateESLint(filePath);
        if (!lintValidation.isValid) {
          return { isValid: false, error: `ESLint error: ${lintValidation.error}` };
        }
      }

      // 4. File size validation (prevent massive files)
      const stats = await fs.stat(filePath);
      const maxFileSize = this.config.maxFileSizeAfterFix || 1024 * 1024; // 1MB default
      if (stats.size > maxFileSize) {
        return { 
          isValid: false, 
          error: `File size ${stats.size} exceeds maximum allowed size ${maxFileSize}` 
        };
      }

      return { isValid: true };
    } catch (error) {
      return { 
        isValid: false, 
        error: error instanceof Error ? error.message : 'Unknown validation error' 
      };
    }
  }

  /**
   * Validate file syntax
   */
  private async validateSyntax(filePath: string): Promise<{ isValid: boolean; error?: string }> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      
      // Basic JavaScript/TypeScript syntax check using Node.js
      if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
        try {
          // Use require.resolve to test if the code would parse
          const Module = require('module');
          const originalCompile = Module.prototype._compile;
          
          let hasError = false;
          let errorMessage = '';
          
          Module.prototype._compile = function(content: string, filename: string) {
            try {
              return originalCompile.call(this, content, filename);
            } catch (error) {
              hasError = true;
              errorMessage = error instanceof Error ? error.message : 'Syntax error';
              throw error;
            }
          };
          
          try {
            new Function(content);
          } catch (error) {
            hasError = true;
            errorMessage = error instanceof Error ? error.message : 'Syntax error';
          }
          
          Module.prototype._compile = originalCompile;
          
          if (hasError) {
            return { isValid: false, error: errorMessage };
          }
        } catch (error) {
          return { 
            isValid: false, 
            error: error instanceof Error ? error.message : 'JavaScript syntax error' 
          };
        }
      }

      return { isValid: true };
    } catch (error) {
      return { 
        isValid: false, 
        error: error instanceof Error ? error.message : 'File read error' 
      };
    }
  }

  /**
   * Validate TypeScript compilation
   */
  private async validateTypeScript(filePath: string): Promise<{ isValid: boolean; error?: string }> {
    try {
      // Basic TypeScript validation using a simple approach
      // In a production environment, you'd use the TypeScript compiler API
      const content = await fs.readFile(filePath, 'utf8');
      
      // Check for basic TypeScript syntax issues
      const commonIssues = [
        { pattern: /\bany\s+any\b/, message: 'Duplicate "any" type' },
        { pattern: /:\s*:\s*/, message: 'Double colon in type annotation' },
        { pattern: /}\s*{/, message: 'Missing semicolon or comma between blocks' },
        { pattern: /import\s*{\s*}\s*from/, message: 'Empty import statement' },
        { pattern: /export\s*{\s*}\s*/, message: 'Empty export statement' },
      ];

      for (const issue of commonIssues) {
        if (issue.pattern.test(content)) {
          return { isValid: false, error: issue.message };
        }
      }

      return { isValid: true };
    } catch (error) {
      return { 
        isValid: false, 
        error: error instanceof Error ? error.message : 'TypeScript validation error' 
      };
    }
  }

  /**
   * Validate with ESLint
   */
  private async validateESLint(filePath: string): Promise<{ isValid: boolean; error?: string }> {
    try {
      if (!this.eslint) {
        return { isValid: true }; // Skip if ESLint not available
      }

      const results = await this.eslint.lintFiles([filePath]);
      
      if (results.length === 0) {
        return { isValid: true };
      }

      const result = results[0];
      if (!result) {
        return { isValid: true };
      }

      // Check for fatal errors (syntax errors)
      if (result.fatalErrorCount && result.fatalErrorCount > 0) {
        const fatalError = result.messages.find(msg => msg.fatal);
        return { 
          isValid: false, 
          error: fatalError ? fatalError.message : 'Fatal ESLint error' 
        };
      }

      // Check for critical errors that should block fixes
      const criticalErrors = result.messages.filter(msg => 
        msg.severity === 2 && // Error level
        (msg.ruleId?.includes('syntax') || msg.message.includes('syntax'))
      );

      if (criticalErrors.length > 0) {
        return { 
          isValid: false, 
          error: criticalErrors[0]?.message || 'Critical ESLint error' 
        };
      }

      return { isValid: true };
    } catch (error) {
      return { 
        isValid: false, 
        error: error instanceof Error ? error.message : 'ESLint validation error' 
      };
    }
  }

  /**
   * Safe Mode Implementation: Check if fix can be applied safely
   */
  private canFixInSafeMode(error: ClassifiedError): boolean {
    // Safe fixes that are always allowed in safe mode
    const safeFixes = [
      'remove_unused_import',
      'remove_console_statement',
      'add_import',
      'fix_import_extension',
    ];

    // Check if this error type has safe fixes available
    const strategy = this.getFixStrategy(error);
    if (strategy && safeFixes.includes(strategy.type)) {
      return true;
    }

    // ESLint auto-fixes are generally safe
    if (error.type === 'eslint' && this.eslint) {
      return true;
    }

    // Conservative approach: block complex fixes in safe mode
    const complexFixes = [
      'add_type_assertion',
      'fix_nextjs_config',
      'fix_package_json',
      'install_dependency',
      'convert_to_next_image',
      'fix_api_route_handler',
    ];

    if (strategy && complexFixes.includes(strategy.type)) {
      return false;
    }

    // Simple type annotation fixes are allowed
    const simpleTypeFixes = [
      'add_type_annotation',
      'add_return_type',
      'add_null_check',
    ];

    if (strategy && simpleTypeFixes.includes(strategy.type)) {
      return true;
    }

    // Default to cautious approach
    return false;
  }

  /**
   * Generate fix preview and safety analysis
   */
  private async generateFixPreview(error: ClassifiedError): Promise<{ canProceed: boolean; reason?: string; preview?: string }> {
    try {
      const strategy = this.getFixStrategy(error);
      
      if (!strategy) {
        return { 
          canProceed: false, 
          reason: 'No fix strategy available' 
        };
      }

      // Risk assessment
      const riskLevel = this.assessFixRisk(error, strategy);
      
      if (riskLevel === 'high') {
        return { 
          canProceed: false, 
          reason: `High-risk fix: ${strategy.description}. Manual intervention recommended.` 
        };
      }

      // Generate preview of what the fix would do
      const preview = await this.generateFixDescription(error, strategy);
      
      // File size and complexity checks
      const fileStats = await fs.stat(error.file);
      const maxSafeFileSize = 50 * 1024; // 50KB
      
      if (fileStats.size > maxSafeFileSize) {
        return { 
          canProceed: false, 
          reason: `File too large (${fileStats.size} bytes) for safe auto-fix. Manual review recommended.`,
          preview 
        };
      }

      return { 
        canProceed: true, 
        preview 
      };
    } catch (error) {
      return { 
        canProceed: false, 
        reason: `Preview generation failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  /**
   * Get fix strategy for error (centralized method)
   */
  private getFixStrategy(error: ClassifiedError): FixStrategy | null {
    switch (error.type) {
      case 'typescript':
        return this.getTypeScriptFixStrategy(error);
      case 'import':
        return this.getImportFixStrategy(error);
      case 'build':
        return this.getBuildFixStrategy(error);
      default:
        return this.getCustomFixStrategy(error);
    }
  }

  /**
   * Assess risk level of applying a fix
   */
  private assessFixRisk(error: ClassifiedError, strategy: FixStrategy): 'low' | 'medium' | 'high' {
    // High risk fixes that could break functionality
    const highRiskFixes = [
      'install_dependency',
      'fix_nextjs_config',
      'fix_package_json',
      'fix_api_route_handler',
      'convert_to_next_image',
      'fix_hook_usage',
      'move_hook_to_component',
    ];

    if (highRiskFixes.includes(strategy.type)) {
      return 'high';
    }

    // Medium risk fixes that change code behavior
    const mediumRiskFixes = [
      'add_type_assertion',
      'fix_property_access',
      'add_missing_property',
      'fix_module_resolution',
      'add_use_client_directive',
      'fix_nextjs_app_router',
    ];

    if (mediumRiskFixes.includes(strategy.type)) {
      return 'medium';
    }

    // Low risk fixes that are generally safe
    return 'low';
  }

  /**
   * Generate human-readable description of what the fix will do
   */
  private async generateFixDescription(error: ClassifiedError, strategy: FixStrategy): Promise<string> {
    const location = `${error.file}:${error.location.line}:${error.location.column}`;
    
    switch (strategy.type) {
      case 'add_import':
        return `Add import statement for '${strategy.target}' at the top of ${location}`;
      case 'add_type_annotation':
        return `Add type annotation to parameter at ${location}`;
      case 'add_return_type':
        return `Add return type annotation to function at ${location}`;
      case 'remove_unused_variable':
        return `Remove unused variable declaration at ${location}`;
      case 'remove_unused_import':
        return `Remove unused import statement at ${location}`;
      case 'remove_console_statement':
        return `Remove console statement at ${location}`;
      case 'add_null_check':
        return `Add null/undefined check at ${location}`;
      case 'fix_property_access':
        return `Fix property access with optional chaining at ${location}`;
      case 'add_use_client_directive':
        return `Add "use client" directive to ${error.file}`;
      default:
        return `Apply ${strategy.description} at ${location}`;
    }
  }

  /**
   * Force apply fix (override safe mode restrictions)
   */
  async forceApplyFix(error: ClassifiedError): Promise<FixResult> {
    const originalSafeMode = this.config.safeMode;
    
    try {
      // Temporarily disable safe mode
      this.config.safeMode = false;
      return await this.applyFix(error);
    } finally {
      // Restore original safe mode setting
      this.config.safeMode = originalSafeMode;
    }
  }

  /**
   * Get fix suggestions when auto-fix is blocked
   */
  getSafeModeAlternatives(error: ClassifiedError): string[] {
    const suggestions: string[] = [];
    
    suggestions.push('Use forceApplyFix() to override safe mode restrictions');
    suggestions.push('Manually apply the fix following the suggested strategy');
    suggestions.push('Review the fix preview and assess safety manually');
    
    const strategy = this.getFixStrategy(error);
    if (strategy) {
      const riskLevel = this.assessFixRisk(error, strategy);
      
      if (riskLevel === 'high') {
        suggestions.push('Consider breaking down the fix into smaller, safer changes');
        suggestions.push('Test the fix in a separate branch first');
        suggestions.push('Review the change with a colleague before applying');
      }
    }
    
    return suggestions;
  }

  /**
   * Fix property access errors by adding optional chaining or type assertions
   */
  private async fixPropertyAccess(error: ClassifiedError, property: string): Promise<FixResult> {
    try {
      const content = await fs.readFile(error.file, 'utf8');
      const lines = content.split('\n');
      const errorLine = lines[error.location.line - 1];
      
      if (!errorLine) {
        return {
          success: false,
          error: 'Could not find error line',
          file: error.file,
          applied: false,
        };
      }

      // Add optional chaining if accessing nested properties
      const optionalChainPattern = new RegExp(`(\\w+)\\.${property}`, 'g');
      let updatedLine = errorLine;

      if (optionalChainPattern.test(errorLine)) {
        updatedLine = errorLine.replace(optionalChainPattern, `$1?.${property}`);
        lines[error.location.line - 1] = updatedLine;
        await fs.writeFile(error.file, lines.join('\n'), 'utf8');
        
        return {
          success: true,
          file: error.file,
          applied: true,
          changes: {
            type: 'add_optional_chaining',
            property,
            lineNumber: error.location.line,
          },
        };
      }

      return {
        success: false,
        error: 'Could not apply property access fix',
        file: error.file,
        applied: false,
      };
    } catch (fixError) {
      return {
        success: false,
        error: fixError instanceof Error ? fixError.message : 'Property access fix failed',
        file: error.file,
        applied: false,
      };
    }
  }

  /**
   * Add type assertion to resolve type mismatches
   */
  private async addTypeAssertion(error: ClassifiedError): Promise<FixResult> {
    try {
      const content = await fs.readFile(error.file, 'utf8');
      const lines = content.split('\n');
      const errorLine = lines[error.location.line - 1];
      
      if (!errorLine) {
        return {
          success: false,
          error: 'Could not find error line',
          file: error.file,
          applied: false,
        };
      }

      // Look for assignment patterns that need type assertions
      const assignmentMatch = errorLine.match(/(\w+)\s*=\s*(.+);?$/);
      if (assignmentMatch && assignmentMatch[1] && assignmentMatch[2]) {
        const [, variable, value] = assignmentMatch;
        const updatedLine = errorLine.replace(value, `${value} as any`);
        lines[error.location.line - 1] = updatedLine;
        await fs.writeFile(error.file, lines.join('\n'), 'utf8');
        
        return {
          success: true,
          file: error.file,
          applied: true,
          changes: {
            type: 'add_type_assertion',
            assertion: 'any',
            lineNumber: error.location.line,
          },
        };
      }

      return {
        success: false,
        error: 'Could not identify pattern for type assertion',
        file: error.file,
        applied: false,
      };
    } catch (assertionError) {
      return {
        success: false,
        error: assertionError instanceof Error ? assertionError.message : 'Type assertion failed',
        file: error.file,
        applied: false,
      };
    }
  }

  /**
   * Add null/undefined checks
   */
  private async addNullCheck(error: ClassifiedError): Promise<FixResult> {
    try {
      const content = await fs.readFile(error.file, 'utf8');
      const lines = content.split('\n');
      const errorLine = lines[error.location.line - 1];
      
      if (!errorLine) {
        return {
          success: false,
          error: 'Could not find error line',
          file: error.file,
          applied: false,
        };
      }

      // Look for property access patterns that need null checks
      const propertyAccessMatch = errorLine.match(/(\w+)\.(\w+)/);
      if (propertyAccessMatch) {
        const [, object, property] = propertyAccessMatch;
        const updatedLine = errorLine.replace(`${object}.${property}`, `${object}?.${property}`);
        lines[error.location.line - 1] = updatedLine;
        await fs.writeFile(error.file, lines.join('\n'), 'utf8');
        
        return {
          success: true,
          file: error.file,
          applied: true,
          changes: {
            type: 'add_optional_chaining',
            object,
            property,
            lineNumber: error.location.line,
          },
        };
      }

      return {
        success: false,
        error: 'Could not identify pattern for null check',
        file: error.file,
        applied: false,
      };
    } catch (nullCheckError) {
      return {
        success: false,
        error: nullCheckError instanceof Error ? nullCheckError.message : 'Null check addition failed',
        file: error.file,
        applied: false,
      };
    }
  }

  /**
   * Remove unused variable declarations
   */
  private async removeUnusedVariable(error: ClassifiedError): Promise<FixResult> {
    try {
      const content = await fs.readFile(error.file, 'utf8');
      const lines = content.split('\n');
      const errorLine = lines[error.location.line - 1];
      
      if (!errorLine) {
        return {
          success: false,
          error: 'Could not find error line',
          file: error.file,
          applied: false,
        };
      }

      // Check if the entire line is just a variable declaration
      const variableMatch = errorLine.match(/^\s*(const|let|var)\s+(\w+)/);
      if (variableMatch && errorLine.trim().endsWith(';')) {
        // Remove the entire line
        lines.splice(error.location.line - 1, 1);
        await fs.writeFile(error.file, lines.join('\n'), 'utf8');
        
        return {
          success: true,
          file: error.file,
          applied: true,
          changes: {
            type: 'remove_unused_variable',
            variable: variableMatch[2],
            lineNumber: error.location.line,
          },
        };
      }

      // Add underscore prefix to mark as intentionally unused
      if (variableMatch && variableMatch[2]) {
        const updatedLine = errorLine.replace(variableMatch[2], `_${variableMatch[2]}`);
        lines[error.location.line - 1] = updatedLine;
        await fs.writeFile(error.file, lines.join('\n'), 'utf8');
        
        return {
          success: true,
          file: error.file,
          applied: true,
          changes: {
            type: 'prefix_unused_variable',
            variable: variableMatch[2],
            lineNumber: error.location.line,
          },
        };
      }

      return {
        success: false,
        error: 'Could not identify unused variable pattern',
        file: error.file,
        applied: false,
      };
    } catch (removeError) {
      return {
        success: false,
        error: removeError instanceof Error ? removeError.message : 'Variable removal failed',
        file: error.file,
        applied: false,
      };
    }
  }

  /**
   * Add missing property to object literal or interface
   */
  private async addMissingProperty(error: ClassifiedError, property: string): Promise<FixResult> {
    try {
      const content = await fs.readFile(error.file, 'utf8');
      const lines = content.split('\n');
      
      // Find object literal or interface near the error
      let insertLine = error.location.line - 1;
      let indentation = '';
      
      // Look for opening brace pattern
      for (let i = insertLine; i >= 0; i--) {
        const line = lines[i];
        if (line && line.includes('{')) {
          insertLine = i + 1;
          indentation = line.match(/^\s*/)?.[0] || '';
          break;
        }
      }

      // Add the missing property with a default value
      const propertyLine = `${indentation}  ${property}: undefined, // TODO: Provide proper value`;
      lines.splice(insertLine, 0, propertyLine);
      
      await fs.writeFile(error.file, lines.join('\n'), 'utf8');
      
      return {
        success: true,
        file: error.file,
        applied: true,
        changes: {
          type: 'add_missing_property',
          property,
          lineNumber: insertLine + 1,
        },
      };
    } catch (propertyError) {
      return {
        success: false,
        error: propertyError instanceof Error ? propertyError.message : 'Property addition failed',
        file: error.file,
        applied: false,
      };
    }
  }

  /**
   * Fix module resolution issues
   */
  private async fixModuleResolution(error: ClassifiedError, moduleName: string): Promise<FixResult> {
    try {
      const content = await fs.readFile(error.file, 'utf8');
      
      // Check if it's a relative import that needs file extension
      if (moduleName.startsWith('./') || moduleName.startsWith('../')) {
        const updated = content.replace(
          new RegExp(`from ['"]${moduleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`, 'g'),
          `from '${moduleName}.js'`
        );
        
        if (updated !== content) {
          await fs.writeFile(error.file, updated, 'utf8');
          return {
            success: true,
            file: error.file,
            applied: true,
            changes: {
              type: 'add_file_extension',
              module: moduleName,
            },
          };
        }
      }

      return {
        success: false,
        error: 'Could not resolve module import issue',
        file: error.file,
        applied: false,
      };
    } catch (moduleError) {
      return {
        success: false,
        error: moduleError instanceof Error ? moduleError.message : 'Module resolution fix failed',
        file: error.file,
        applied: false,
      };
    }
  }

  // Custom NextJS-specific fix implementations

  /**
   * Add "use client" directive to component
   */
  private async addUseClientDirective(error: ClassifiedError): Promise<FixResult> {
    try {
      const content = await fs.readFile(error.file, 'utf8');
      const lines = content.split('\n');
      
      // Check if directive already exists
      if (content.includes('"use client"') || content.includes("'use client'")) {
        return {
          success: false,
          error: '"use client" directive already present',
          file: error.file,
          applied: false,
        };
      }

      // Add directive at the top of the file (after any shebang)
      let insertIndex = 0;
      if (lines[0]?.startsWith('#!')) {
        insertIndex = 1;
      }

      lines.splice(insertIndex, 0, '"use client";', '');
      await fs.writeFile(error.file, lines.join('\n'), 'utf8');

      return {
        success: true,
        file: error.file,
        applied: true,
        changes: {
          type: 'add_use_client_directive',
          lineNumber: insertIndex + 1,
        },
      };
    } catch (clientError) {
      return {
        success: false,
        error: clientError instanceof Error ? clientError.message : 'Use client directive addition failed',
        file: error.file,
        applied: false,
      };
    }
  }

  /**
   * Fix NextJS App Router usage patterns
   */
  private async fixNextJSAppRouter(error: ClassifiedError): Promise<FixResult> {
    try {
      const content = await fs.readFile(error.file, 'utf8');
      
      // Replace useRouter from next/router with useRouter from next/navigation
      const updated = content.replace(
        /import\s*{\s*useRouter\s*}\s*from\s*['"]next\/router['"]/g,
        "import { useRouter } from 'next/navigation'"
      );

      if (updated !== content) {
        await fs.writeFile(error.file, updated, 'utf8');
        return {
          success: true,
          file: error.file,
          applied: true,
          changes: {
            type: 'fix_nextjs_app_router',
            description: 'Updated useRouter import for App Router',
          },
        };
      }

      return {
        success: false,
        error: 'No App Router patterns found to fix',
        file: error.file,
        applied: false,
      };
    } catch (routerError) {
      return {
        success: false,
        error: routerError instanceof Error ? routerError.message : 'App Router fix failed',
        file: error.file,
        applied: false,
      };
    }
  }

  /**
   * Add proper API response handling
   */
  private async addAPIResponse(error: ClassifiedError): Promise<FixResult> {
    try {
      const content = await fs.readFile(error.file, 'utf8');
      const lines = content.split('\n');
      
      // Find function that needs response
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line && line.includes('export') && (line.includes('function') || line.includes('=>'))) {
          // Look for missing return statement
          const functionEnd = this.findFunctionEnd(lines, i);
          if (functionEnd && !this.hasPropResponse(lines, i, functionEnd)) {
            // Add default response
            const indentation = line.match(/^\s*/)?.[0] || '';
            lines.splice(functionEnd, 0, `${indentation}  return Response.json({ message: 'Success' });`);
            
            await fs.writeFile(error.file, lines.join('\n'), 'utf8');
            return {
              success: true,
              file: error.file,
              applied: true,
              changes: {
                type: 'add_api_response',
                lineNumber: functionEnd + 1,
              },
            };
          }
        }
      }

      return {
        success: false,
        error: 'Could not find appropriate location for API response',
        file: error.file,
        applied: false,
      };
    } catch (responseError) {
      return {
        success: false,
        error: responseError instanceof Error ? responseError.message : 'API response addition failed',
        file: error.file,
        applied: false,
      };
    }
  }

  /**
   * Fix API route handler patterns
   */
  private async fixAPIRouteHandler(error: ClassifiedError): Promise<FixResult> {
    try {
      const content = await fs.readFile(error.file, 'utf8');
      
      // Convert pages API routes to app router format
      let updated = content.replace(
        /export\s+default\s+function\s+handler\s*\(\s*req\s*,\s*res\s*\)/g,
        'export async function GET(request: Request)'
      );

      // Update response patterns
      updated = updated.replace(
        /res\.status\(\d+\)\.json\(/g,
        'return Response.json('
      );

      if (updated !== content) {
        await fs.writeFile(error.file, updated, 'utf8');
        return {
          success: true,
          file: error.file,
          applied: true,
          changes: {
            type: 'fix_api_route_handler',
            description: 'Updated API route handler for App Router',
          },
        };
      }

      return {
        success: false,
        error: 'No API handler patterns found to fix',
        file: error.file,
        applied: false,
      };
    } catch (handlerError) {
      return {
        success: false,
        error: handlerError instanceof Error ? handlerError.message : 'API handler fix failed',
        file: error.file,
        applied: false,
      };
    }
  }

  /**
   * Add alt attribute to images
   */
  private async addAltAttribute(error: ClassifiedError): Promise<FixResult> {
    try {
      const content = await fs.readFile(error.file, 'utf8');
      
      // Add alt attribute to img tags and Image components
      let updated = content.replace(
        /<(img|Image)\s+([^>]*?)src=(['"][^'"]+['"])([^>]*?)>/g,
        (match, tag, beforeSrc, src, afterSrc) => {
          if (match.includes('alt=')) {
            return match; // Alt already exists
          }
          return `<${tag} ${beforeSrc}src=${src} alt="" ${afterSrc}>`;
        }
      );

      if (updated !== content) {
        await fs.writeFile(error.file, updated, 'utf8');
        return {
          success: true,
          file: error.file,
          applied: true,
          changes: {
            type: 'add_alt_attribute',
            description: 'Added alt attributes to images',
          },
        };
      }

      return {
        success: false,
        error: 'No images found that need alt attributes',
        file: error.file,
        applied: false,
      };
    } catch (altError) {
      return {
        success: false,
        error: altError instanceof Error ? altError.message : 'Alt attribute addition failed',
        file: error.file,
        applied: false,
      };
    }
  }

  /**
   * Add priority prop to above-fold images
   */
  private async addPriorityProp(error: ClassifiedError): Promise<FixResult> {
    try {
      const content = await fs.readFile(error.file, 'utf8');
      
      // Add priority prop to Image components
      const updated = content.replace(
        /<Image\s+([^>]*?)>/g,
        (match, props) => {
          if (match.includes('priority')) {
            return match; // Priority already exists
          }
          return `<Image ${props} priority>`;
        }
      );

      if (updated !== content) {
        await fs.writeFile(error.file, updated, 'utf8');
        return {
          success: true,
          file: error.file,
          applied: true,
          changes: {
            type: 'add_priority_prop',
            description: 'Added priority prop to images',
          },
        };
      }

      return {
        success: false,
        error: 'No Image components found that need priority prop',
        file: error.file,
        applied: false,
      };
    } catch (priorityError) {
      return {
        success: false,
        error: priorityError instanceof Error ? priorityError.message : 'Priority prop addition failed',
        file: error.file,
        applied: false,
      };
    }
  }

  /**
   * Convert img tags to Next.js Image components
   */
  private async convertToNextImage(error: ClassifiedError): Promise<FixResult> {
    try {
      const content = await fs.readFile(error.file, 'utf8');
      
      // Check if Image is already imported
      let updated = content;
      if (!content.includes("import Image from 'next/image'")) {
        // Add import at the top
        const lines = content.split('\n');
        let insertIndex = 0;
        
        // Find appropriate location for import
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line && (line.startsWith('import ') || line.startsWith('const '))) {
            insertIndex = i + 1;
          } else if (line && line.trim() === '') {
            continue;
          } else {
            break;
          }
        }
        
        lines.splice(insertIndex, 0, "import Image from 'next/image';");
        updated = lines.join('\n');
      }

      // Convert img tags to Image components
      updated = updated.replace(
        /<img\s+([^>]*?)>/g,
        (match, props) => {
          // Extract src and alt
          const srcMatch = props.match(/src=(['"][^'"]+['"])/);
          const altMatch = props.match(/alt=(['"][^'"]*['"])/);
          
          if (srcMatch) {
            const src = srcMatch[1];
            const alt = altMatch ? altMatch[1] : '""';
            return `<Image src=${src} alt=${alt} width={500} height={300} />`;
          }
          return match;
        }
      );

      if (updated !== content) {
        await fs.writeFile(error.file, updated, 'utf8');
        return {
          success: true,
          file: error.file,
          applied: true,
          changes: {
            type: 'convert_to_next_image',
            description: 'Converted img tags to Next.js Image components',
          },
        };
      }

      return {
        success: false,
        error: 'No img tags found to convert',
        file: error.file,
        applied: false,
      };
    } catch (imageError) {
      return {
        success: false,
        error: imageError instanceof Error ? imageError.message : 'Image conversion failed',
        file: error.file,
        applied: false,
      };
    }
  }

  /**
   * Fix useEffect dependency arrays
   */
  private async fixHookDependencies(error: ClassifiedError): Promise<FixResult> {
    try {
      const content = await fs.readFile(error.file, 'utf8');
      const lines = content.split('\n');
      const errorLine = lines[error.location.line - 1];
      
      if (!errorLine) {
        return {
          success: false,
          error: 'Could not find error line',
          file: error.file,
          applied: false,
        };
      }

      // Find useEffect and add missing dependency
      const useEffectMatch = errorLine.match(/useEffect\s*\(/);
      if (useEffectMatch) {
        // Simple fix: add empty dependency array if missing
        if (!errorLine.includes('],') && !errorLine.includes(']')) {
          const updatedLine = errorLine.replace('useEffect(', 'useEffect(').replace(/\)([^)]*);?$/, '), []);');
          lines[error.location.line - 1] = updatedLine;
          
          await fs.writeFile(error.file, lines.join('\n'), 'utf8');
          return {
            success: true,
            file: error.file,
            applied: true,
            changes: {
              type: 'fix_hook_dependencies',
              lineNumber: error.location.line,
            },
          };
        }
      }

      return {
        success: false,
        error: 'Could not identify dependency fix pattern',
        file: error.file,
        applied: false,
      };
    } catch (depError) {
      return {
        success: false,
        error: depError instanceof Error ? depError.message : 'Hook dependency fix failed',
        file: error.file,
        applied: false,
      };
    }
  }

  /**
   * Move hook usage inside React component
   */
  private async moveHookToComponent(error: ClassifiedError): Promise<FixResult> {
    return {
      success: false,
      error: 'Hook movement requires manual refactoring',
      file: error.file,
      applied: false,
    };
  }

  /**
   * Fix React Hook usage patterns
   */
  private async fixHookUsage(error: ClassifiedError): Promise<FixResult> {
    return {
      success: false,
      error: 'Hook usage fixes require context-specific analysis',
      file: error.file,
      applied: false,
    };
  }

  /**
   * Add key prop to list items
   */
  private async addKeyProp(error: ClassifiedError): Promise<FixResult> {
    try {
      const content = await fs.readFile(error.file, 'utf8');
      
      // Find list items without key props
      const updated = content.replace(
        /\.map\s*\(\s*\(([^)]+)\)\s*=>\s*<([^>]+)([^>]*?)>/g,
        (match, params, tag, props) => {
          if (props.includes('key=')) {
            return match; // Key already exists
          }
          const paramName = params.split(',')[0]?.trim();
          return match.replace(`<${tag}${props}>`, `<${tag} key={${paramName}.id || ${paramName}}${props}>`);
        }
      );

      if (updated !== content) {
        await fs.writeFile(error.file, updated, 'utf8');
        return {
          success: true,
          file: error.file,
          applied: true,
          changes: {
            type: 'add_key_prop',
            description: 'Added key props to list items',
          },
        };
      }

      return {
        success: false,
        error: 'No list items found that need key props',
        file: error.file,
        applied: false,
      };
    } catch (keyError) {
      return {
        success: false,
        error: keyError instanceof Error ? keyError.message : 'Key prop addition failed',
        file: error.file,
        applied: false,
      };
    }
  }

  /**
   * Remove console statements
   */
  private async removeConsoleStatement(error: ClassifiedError): Promise<FixResult> {
    try {
      const content = await fs.readFile(error.file, 'utf8');
      const lines = content.split('\n');
      const errorLine = lines[error.location.line - 1];
      
      if (!errorLine) {
        return {
          success: false,
          error: 'Could not find error line',
          file: error.file,
          applied: false,
        };
      }

      // Remove console statement
      if (errorLine.includes('console.')) {
        lines.splice(error.location.line - 1, 1);
        await fs.writeFile(error.file, lines.join('\n'), 'utf8');
        
        return {
          success: true,
          file: error.file,
          applied: true,
          changes: {
            type: 'remove_console_statement',
            lineNumber: error.location.line,
          },
        };
      }

      return {
        success: false,
        error: 'No console statement found to remove',
        file: error.file,
        applied: false,
      };
    } catch (consoleError) {
      return {
        success: false,
        error: consoleError instanceof Error ? consoleError.message : 'Console removal failed',
        file: error.file,
        applied: false,
      };
    }
  }

  /**
   * Fix environment variable usage
   */
  private async fixEnvVariableUsage(error: ClassifiedError): Promise<FixResult> {
    try {
      const content = await fs.readFile(error.file, 'utf8');
      
      // Add NEXT_PUBLIC_ prefix for client-side env vars
      const updated = content.replace(
        /process\.env\.([A-Z_]+)/g,
        (match, varName) => {
          if (varName.startsWith('NEXT_PUBLIC_')) {
            return match; // Already has prefix
          }
          return `process.env.NEXT_PUBLIC_${varName}`;
        }
      );

      if (updated !== content) {
        await fs.writeFile(error.file, updated, 'utf8');
        return {
          success: true,
          file: error.file,
          applied: true,
          changes: {
            type: 'fix_env_variable_usage',
            description: 'Added NEXT_PUBLIC_ prefix to environment variables',
          },
        };
      }

      return {
        success: false,
        error: 'No environment variable usage found to fix',
        file: error.file,
        applied: false,
      };
    } catch (envError) {
      return {
        success: false,
        error: envError instanceof Error ? envError.message : 'Environment variable fix failed',
        file: error.file,
        applied: false,
      };
    }
  }

  /**
   * Fix TypeScript strict mode type issues
   */
  private async fixStrictModeTypes(error: ClassifiedError): Promise<FixResult> {
    try {
      const content = await fs.readFile(error.file, 'utf8');
      
      // Add | undefined to optional properties
      const updated = content.replace(
        /(\w+)\?\s*:\s*([^|;\n]+)([;\n])/g,
        '$1?: $2 | undefined$3'
      );

      if (updated !== content) {
        await fs.writeFile(error.file, updated, 'utf8');
        return {
          success: true,
          file: error.file,
          applied: true,
          changes: {
            type: 'fix_strict_mode_types',
            description: 'Added undefined to optional property types',
          },
        };
      }

      return {
        success: false,
        error: 'No strict mode type issues found to fix',
        file: error.file,
        applied: false,
      };
    } catch (strictError) {
      return {
        success: false,
        error: strictError instanceof Error ? strictError.message : 'Strict mode fix failed',
        file: error.file,
        applied: false,
      };
    }
  }

  /**
   * Remove unused import statements
   */
  private async removeUnusedImport(error: ClassifiedError): Promise<FixResult> {
    try {
      const content = await fs.readFile(error.file, 'utf8');
      const lines = content.split('\n');
      const errorLine = lines[error.location.line - 1];
      
      if (!errorLine) {
        return {
          success: false,
          error: 'Could not find error line',
          file: error.file,
          applied: false,
        };
      }

      // Remove entire import line if it's unused
      if (errorLine.includes('import') && errorLine.includes('from')) {
        lines.splice(error.location.line - 1, 1);
        await fs.writeFile(error.file, lines.join('\n'), 'utf8');
        
        return {
          success: true,
          file: error.file,
          applied: true,
          changes: {
            type: 'remove_unused_import',
            lineNumber: error.location.line,
          },
        };
      }

      return {
        success: false,
        error: 'No unused import found to remove',
        file: error.file,
        applied: false,
      };
    } catch (importError) {
      return {
        success: false,
        error: importError instanceof Error ? importError.message : 'Import removal failed',
        file: error.file,
        applied: false,
      };
    }
  }

  // Helper methods for custom fixes

  /**
   * Find the end of a function block
   */
  private findFunctionEnd(lines: string[], startIndex: number): number | null {
    let braceCount = 0;
    let foundStart = false;
    
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      if (line) {
        for (const char of line) {
          if (char === '{') {
            braceCount++;
            foundStart = true;
          } else if (char === '}') {
            braceCount--;
            if (foundStart && braceCount === 0) {
              return i;
            }
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Check if function already has proper response
   */
  private hasPropResponse(lines: string[], start: number, end: number): boolean {
    for (let i = start; i <= end; i++) {
      const line = lines[i];
      if (line && (line.includes('return') || line.includes('Response.'))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get fix suggestions for errors that can't be auto-fixed
   */
  getFixSuggestions(error: ClassifiedError): string[] {
    const suggestions: string[] = [];

    switch (error.type) {
      case 'typescript':
        suggestions.push('Check TypeScript documentation for this error code');
        suggestions.push('Verify type definitions are correct');
        suggestions.push('Consider adding explicit type annotations');
        suggestions.push('Check for null/undefined access patterns');
        break;
      case 'import':
        suggestions.push('Check if the module is installed');
        suggestions.push('Verify the import path is correct');
        suggestions.push('Add file extensions for relative imports');
        break;
      case 'build':
        suggestions.push('Check Next.js configuration');
        suggestions.push('Verify all dependencies are installed');
        suggestions.push('Clear build cache and rebuild');
        break;
      default:
        suggestions.push('Check the error message for specific guidance');
        suggestions.push('Consult relevant documentation');
        break;
    }

    return suggestions;
  }
}