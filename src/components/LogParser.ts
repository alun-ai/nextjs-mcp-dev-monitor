/**
 * LogParser component - parses NextJS development server logs
 * TODO: Implement in Task 3.2.2
 */

import { ParsedError } from '@/types/errors.js';

export interface ILogParser {
  parseLogLine(line: string): ParsedError | null;
  parseLogBuffer(buffer: string): ParsedError[];
}

export class LogParser implements ILogParser {
  parseLogLine(line: string): ParsedError | null {
    throw new Error('LogParser.parseLogLine() not yet implemented');
  }

  parseLogBuffer(buffer: string): ParsedError[] {
    throw new Error('LogParser.parseLogBuffer() not yet implemented');
  }
}