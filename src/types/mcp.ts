/**
 * MCP tool interface definitions
 */

import { MonitorConfig } from './config.js';
import { ClassifiedError, FixResult } from './errors.js';

export interface MCPToolResponse<T = unknown> {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    url?: string;
  }>;
  isError?: boolean;
  _meta?: T;
}

export interface StartMonitoringInput {
  projectPath?: string;
  config?: Partial<MonitorConfig>;
}

export interface StartMonitoringOutput {
  status: 'started' | 'already_running' | 'failed';
  processId?: number | undefined;
  monitoringUrl?: string | undefined;
  message: string;
}

export interface GetErrorsInput {
  filter?: {
    type?: string[];
    severity?: string[];
    fixable?: boolean;
  };
  limit?: number;
  offset?: number;
}

export interface GetErrorsOutput {
  errors: ClassifiedError[];
  total: number;
  hasMore: boolean;
}

export interface ApplyFixInput {
  errorId: string;
  confirmFix?: boolean;
  createBackup?: boolean;
}

export interface ApplyFixOutput extends FixResult {
  recommendation?: string;
}

export interface MonitorStatusInput {
  includeMetrics?: boolean;
}

export interface MonitorStatusOutput {
  isRunning: boolean;
  processId?: number | undefined;
  uptime?: number | undefined;
  projectPath?: string | undefined;
  metrics?: {
    errorsDetected: number;
    fixesApplied: number;
    successRate: number;
  } | undefined;
}

export interface StopMonitoringInput {
  force?: boolean;
}

export interface StopMonitoringOutput {
  status: 'stopped' | 'not_running' | 'failed';
  message: string;
}