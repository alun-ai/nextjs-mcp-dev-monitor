/**
 * ProcessManager component - manages NextJS development server process
 * Handles spawning, monitoring, and controlling the NextJS dev server
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { DevServerOptions } from '../types/config.js';

export interface IProcessManager {
  start(projectPath: string, options?: DevServerOptions): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  isRunning(): boolean;
  on(event: 'stdout' | 'stderr' | 'exit' | 'error', listener: (...args: any[]) => void): this;
  off(event: string, listener: (...args: any[]) => void): this;
}

export class ProcessManager extends EventEmitter implements IProcessManager {
  private process: ChildProcess | undefined = undefined;
  private projectPath: string | undefined = undefined;
  private options: DevServerOptions | undefined = undefined;
  private outputBuffer: string[] = [];
  private isStarting = false;

  constructor() {
    super();
    this.setupGracefulShutdown();
  }

  async start(projectPath: string, options?: DevServerOptions): Promise<void> {
    if (this.isStarting) {
      throw new Error('Process is already starting');
    }

    if (this.isRunning()) {
      throw new Error('Process is already running');
    }

    this.isStarting = true;
    this.projectPath = projectPath;
    this.options = options;

    try {
      await this.spawnDevServer();
    } catch (error) {
      this.isStarting = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.process) {
      return;
    }

    return new Promise((resolve, reject) => {
      if (!this.process) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGKILL');
          reject(new Error('Process force killed after timeout'));
        }
      }, 10000); // 10 second timeout

      this.process.once('exit', () => {
        clearTimeout(timeout);
        this.cleanup();
        resolve();
      });

      this.process.once('error', (error) => {
        clearTimeout(timeout);
        this.cleanup();
        reject(error);
      });

      // Try graceful shutdown first
      this.process.kill('SIGTERM');
    });
  }

  async restart(): Promise<void> {
    if (this.isRunning()) {
      await this.stop();
    }
    
    if (this.projectPath) {
      await this.start(this.projectPath, this.options);
    } else {
      throw new Error('Cannot restart: no project path stored');
    }
  }

  isRunning(): boolean {
    return this.process !== undefined && !this.process.killed;
  }

  private async spawnDevServer(): Promise<void> {
    if (!this.projectPath) {
      throw new Error('Project path is required');
    }

    return new Promise((resolve, reject) => {
      const args = ['run', 'dev'];
      
      // Add debug flag for better error reporting
      args.push('--', '--debug');

      // Add port and hostname if specified
      if (this.options?.port) {
        args.push('--port', this.options.port.toString());
      }
      if (this.options?.hostname) {
        args.push('--hostname', this.options.hostname);
      }

      this.process = spawn('npm', args, {
        cwd: this.projectPath,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_ENV: 'development',
          // Ensure we get detailed error output
          DEBUG: 'next:*',
        },
      });

      this.process.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        this.outputBuffer.push(output);
        this.emit('stdout', output);
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        const output = data.toString();
        this.outputBuffer.push(output);
        this.emit('stderr', output);
      });

      this.process.on('error', (error) => {
        this.isStarting = false;
        this.cleanup();
        this.emit('error', error);
        reject(error);
      });

      this.process.on('exit', (code, signal) => {
        this.isStarting = false;
        this.cleanup();
        this.emit('exit', code, signal);
        
        if (code !== 0 && code !== null) {
          reject(new Error(`Process exited with code ${code}`));
        }
      });

      // Consider the process started when we see the ready message
      const checkReady = (data: string) => {
        if (data.includes('Ready') || data.includes('started server') || data.includes('Local:')) {
          this.isStarting = false;
          this.process?.stdout?.off('data', checkReady);
          this.process?.stderr?.off('data', checkReady);
          resolve();
        }
      };

      this.process.stdout?.on('data', checkReady);
      this.process.stderr?.on('data', checkReady);

      // Timeout if process doesn't start within 30 seconds
      setTimeout(() => {
        if (this.isStarting) {
          this.isStarting = false;
          this.process?.kill();
          reject(new Error('Process startup timeout'));
        }
      }, 30000);
    });
  }

  private cleanup(): void {
    this.process = undefined;
    this.isStarting = false;
  }

  private setupGracefulShutdown(): void {
    const shutdown = async () => {
      if (this.isRunning()) {
        console.log('Shutting down NextJS dev server...');
        await this.stop().catch(console.error);
      }
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('beforeExit', shutdown);
  }

  public getOutputBuffer(): string[] {
    return [...this.outputBuffer];
  }

  public clearOutputBuffer(): void {
    this.outputBuffer = [];
  }
}