/**
 * MonitorService - orchestrates ProcessManager, LogParser, and ErrorClassifier
 * Provides high-level monitoring functionality for MCP tools
 */

import { ProcessManager, IProcessManager } from './ProcessManager.js';
import { LogParser, ILogParser } from './LogParser.js';
import { ErrorClassifier, IErrorClassifier } from './ErrorClassifier.js';
import { AutoFixer, IAutoFixer } from './AutoFixer.js';
import { MonitorConfig, DEFAULT_CONFIG } from '../types/config.js';
import { ClassifiedError, FixResult } from '../types/errors.js';
import { EventEmitter } from 'events';

export interface IMonitorService {
  start(projectPath: string, config?: Partial<MonitorConfig>): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  getCurrentErrors(): ClassifiedError[];
  getMetrics(): MonitorMetrics;
  applyAutoFix(error: ClassifiedError): Promise<FixResult>;
  on(event: 'error' | 'newError' | 'errorResolved' | 'statusChange', listener: (...args: any[]) => void): this;
  off(event: string, listener: (...args: any[]) => void): this;
}

export interface MonitorMetrics {
  errorsDetected: number;
  fixesApplied: number;
  successRate: number;
  uptime: number;
  processId?: number;
}

export class MonitorService extends EventEmitter implements IMonitorService {
  private processManager: IProcessManager;
  private logParser: ILogParser;
  private errorClassifier: IErrorClassifier;
  private autoFixer: IAutoFixer | undefined;
  private config: MonitorConfig;
  private currentErrors: Map<string, ClassifiedError> = new Map();
  private startTime: Date | undefined = undefined;
  private metrics: MonitorMetrics = {
    errorsDetected: 0,
    fixesApplied: 0,
    successRate: 0,
    uptime: 0,
  };

  constructor(
    processManager?: IProcessManager,
    logParser?: ILogParser,
    errorClassifier?: IErrorClassifier,
    autoFixer?: IAutoFixer
  ) {
    super();
    this.processManager = processManager || new ProcessManager();
    this.logParser = logParser || new LogParser();
    this.errorClassifier = errorClassifier || new ErrorClassifier();
    this.autoFixer = autoFixer;
    this.config = DEFAULT_CONFIG;
    
    this.setupEventHandlers();
  }

  async start(projectPath: string, config?: Partial<MonitorConfig>): Promise<void> {
    if (this.isRunning()) {
      throw new Error('Monitor is already running');
    }

    // Merge provided config with defaults
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      projectPath,
    };

    this.startTime = new Date();
    this.currentErrors.clear();
    this.resetMetrics();

    // Initialize AutoFixer with the config if enabled
    if (this.config.autoFix && !this.autoFixer) {
      this.autoFixer = new AutoFixer(this.config);
    }

    try {
      await this.processManager.start(projectPath, {
        port: 3000, // Default Next.js port
        dev: true,
      });

      this.emit('statusChange', 'started');
    } catch (error) {
      this.startTime = undefined;
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning()) {
      return;
    }

    await this.processManager.stop();
    this.startTime = undefined;
    this.emit('statusChange', 'stopped');
  }

  isRunning(): boolean {
    return this.processManager.isRunning();
  }

  getCurrentErrors(): ClassifiedError[] {
    return Array.from(this.currentErrors.values())
      .sort((a, b) => b.priority - a.priority);
  }

  getMetrics(): MonitorMetrics {
    const uptime = this.startTime 
      ? Date.now() - this.startTime.getTime() 
      : 0;

    return {
      ...this.metrics,
      uptime: Math.floor(uptime / 1000), // Convert to seconds
    };
  }

  private setupEventHandlers(): void {
    this.processManager.on('stdout', (data: string) => {
      this.processLogOutput(data);
    });

    this.processManager.on('stderr', (data: string) => {
      this.processLogOutput(data);
    });

    this.processManager.on('error', (error: Error) => {
      this.emit('error', error);
    });

    this.processManager.on('exit', (code: number, signal: string) => {
      this.emit('statusChange', 'exited', { code, signal });
    });
  }

  private processLogOutput(data: string): void {
    try {
      const parsedErrors = this.logParser.parseLogBuffer(data);
      
      if (parsedErrors.length > 0) {
        const classifiedErrors = this.errorClassifier.classifyErrors(parsedErrors);
        
        for (const error of classifiedErrors) {
          this.handleNewError(error);
        }
      }
    } catch (error) {
      console.warn('Error processing log output:', error);
    }
  }

  private handleNewError(error: ClassifiedError): void {
    // Create a unique key for error deduplication
    const errorKey = `${error.type}:${error.location.file}:${error.location.line}:${error.message}`;
    
    if (!this.currentErrors.has(errorKey)) {
      this.currentErrors.set(errorKey, error);
      this.metrics.errorsDetected++;
      this.emit('newError', error);
    } else {
      // Update existing error with latest timestamp
      const existingError = this.currentErrors.get(errorKey)!;
      existingError.timestamp = error.timestamp;
    }
  }

  private resetMetrics(): void {
    this.metrics = {
      errorsDetected: 0,
      fixesApplied: 0,
      successRate: 0,
      uptime: 0,
    };
  }

  public markErrorResolved(errorId: string): void {
    for (const [key, error] of this.currentErrors.entries()) {
      if (error.id === errorId) {
        this.currentErrors.delete(key);
        this.emit('errorResolved', error);
        break;
      }
    }
  }

  public incrementFixesApplied(): void {
    this.metrics.fixesApplied++;
    this.metrics.successRate = this.metrics.errorsDetected > 0 
      ? (this.metrics.fixesApplied / this.metrics.errorsDetected) * 100 
      : 0;
  }

  public clearErrors(): void {
    this.currentErrors.clear();
  }

  public getErrorById(errorId: string): ClassifiedError | undefined {
    for (const error of this.currentErrors.values()) {
      if (error.id === errorId) {
        return error;
      }
    }
    return undefined;
  }

  public getFilteredErrors(filter: {
    type?: string[];
    severity?: string[];
    fixable?: boolean;
  }): ClassifiedError[] {
    let errors = this.getCurrentErrors();

    if (filter.type && filter.type.length > 0) {
      errors = errors.filter(error => filter.type!.includes(error.type));
    }

    if (filter.severity && filter.severity.length > 0) {
      errors = errors.filter(error => filter.severity!.includes(error.severity));
    }

    if (filter.fixable !== undefined) {
      errors = errors.filter(error => error.autoFixable === filter.fixable);
    }

    return errors;
  }

  /**
   * Apply automatic fix for a classified error
   */
  public async applyAutoFix(error: ClassifiedError): Promise<FixResult> {
    if (!this.autoFixer) {
      return {
        success: false,
        file: error.file,
        applied: false,
        error: 'AutoFixer not initialized - ensure autoFix is enabled in config',
      };
    }

    if (!error.autoFixable) {
      return {
        success: false,
        file: error.file,
        applied: false,
        error: 'This error is not auto-fixable',
      };
    }

    try {
      const fixResult = await this.autoFixer.applyFix(error);
      
      if (fixResult.success) {
        this.incrementFixesApplied();
        this.markErrorResolved(error.id);
        this.emit('errorResolved', error);
      }
      
      return fixResult;
    } catch (fixError) {
      return {
        success: false,
        file: error.file,
        applied: false,
        error: fixError instanceof Error ? fixError.message : 'Auto-fix failed',
      };
    }
  }
}