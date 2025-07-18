/**
 * ProcessManager component - manages NextJS development server process
 * TODO: Implement in Task 3.2.1
 */

import { DevServerOptions } from '@/types/config.js';

export interface IProcessManager {
  start(projectPath: string, options?: DevServerOptions): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  isRunning(): boolean;
}

export class ProcessManager implements IProcessManager {
  async start(projectPath: string, options?: DevServerOptions): Promise<void> {
    throw new Error('ProcessManager.start() not yet implemented');
  }

  async stop(): Promise<void> {
    throw new Error('ProcessManager.stop() not yet implemented');
  }

  async restart(): Promise<void> {
    throw new Error('ProcessManager.restart() not yet implemented');
  }

  isRunning(): boolean {
    return false;
  }
}