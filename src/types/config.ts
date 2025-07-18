/**
 * Configuration type definitions
 */

export interface MonitorConfig {
  projectPath: string;
  autoFix: boolean;
  safeMode: boolean;
  backupEnabled: boolean;
  logLevel: LogLevel;
  excludePatterns: string[];
  includePatterns: string[];
}

export interface DevServerOptions {
  port?: number;
  hostname?: string;
  dev?: boolean;
  dir?: string;
  quiet?: boolean;
  conf?: unknown;
}

export interface AutoFixConfig {
  eslintEnabled: boolean;
  typescriptEnabled: boolean;
  customRulesEnabled: boolean;
  maxFixAttempts: number;
  confirmBeforeFix: boolean;
}

export interface BackupConfig {
  enabled: boolean;
  maxBackups: number;
  backupDir: string;
  retentionDays: number;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export const DEFAULT_CONFIG: MonitorConfig = {
  projectPath: process.cwd(),
  autoFix: true,
  safeMode: true,
  backupEnabled: true,
  logLevel: 'info',
  excludePatterns: ['node_modules/**', 'dist/**', '.next/**'],
  includePatterns: ['src/**/*.ts', 'src/**/*.tsx', 'pages/**/*.ts', 'pages/**/*.tsx'],
};