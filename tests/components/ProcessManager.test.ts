/**
 * ProcessManager Unit Tests
 * Comprehensive testing of NextJS development server process management
 */

import { ProcessManager } from '../../src/components/ProcessManager';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

// Mock child_process for isolated testing
jest.mock('child_process');
const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

// Mock EventEmitter for controlled testing
class MockChildProcess extends EventEmitter {
  killed = false;
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  
  kill(signal?: string): boolean {
    this.killed = true;
    // Emit exit immediately for testing
    this.emit('exit', signal === 'SIGKILL' ? null : 0, signal);
    return true;
  }
}

describe('ProcessManager', () => {
  let processManager: ProcessManager;
  let mockProcess: MockChildProcess;
  let consoleSpy: jest.SpyInstance;

  beforeAll(() => {
    // Increase max listeners to prevent warnings during tests
    process.setMaxListeners(20);
  });

  afterAll(() => {
    process.setMaxListeners(10); // Reset to default
  });

  beforeEach(() => {
    processManager = new ProcessManager();
    mockProcess = new MockChildProcess();
    mockSpawn.mockReturnValue(mockProcess as any);
    
    // Suppress console output during tests
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
    consoleSpy.mockRestore();
    
    // Remove all listeners added by ProcessManager
    processManager.removeAllListeners();
  });

  describe('Process Spawning', () => {
    test('should spawn NextJS development server with default options', async () => {
      const projectPath = '/test/project';
      
      // Trigger ready signal immediately
      process.nextTick(() => {
        mockProcess.stdout.emit('data', Buffer.from('Ready on http://localhost:3000'));
      });

      await processManager.start(projectPath);

      expect(mockSpawn).toHaveBeenCalledWith('npm', ['run', 'dev', '--', '--debug'], {
        cwd: projectPath,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: expect.objectContaining({
          NODE_ENV: 'development',
          DEBUG: 'next:*',
        }),
      });
      expect(processManager.isRunning()).toBe(true);
    });

    test('should spawn NextJS development server with custom options', async () => {
      const projectPath = '/test/project';
      const options = {
        port: 4000,
        hostname: 'localhost',
        dev: true,
      };
      
      process.nextTick(() => {
        mockProcess.stdout.emit('data', Buffer.from('started server on http://localhost:4000'));
      });

      await processManager.start(projectPath, options);

      expect(mockSpawn).toHaveBeenCalledWith(
        'npm', 
        ['run', 'dev', '--', '--debug', '--port', '4000', '--hostname', 'localhost'],
        expect.objectContaining({
          cwd: projectPath,
        })
      );
    });

    test('should reject if process is already running', async () => {
      const projectPath = '/test/project';
      
      process.nextTick(() => {
        mockProcess.stdout.emit('data', Buffer.from('Ready'));
      });

      await processManager.start(projectPath);
      
      await expect(processManager.start(projectPath)).rejects.toThrow('Process is already running');
    });
  });

  describe('Process Lifecycle Management', () => {
    beforeEach(async () => {
      // Setup running process for lifecycle tests
      process.nextTick(() => {
        mockProcess.stdout.emit('data', Buffer.from('Ready'));
      });
      
      await processManager.start('/test/project');
    });

    test('should stop running process gracefully', async () => {
      const killSpy = jest.spyOn(mockProcess, 'kill');
      
      await processManager.stop();
      
      expect(killSpy).toHaveBeenCalledWith('SIGTERM');
      expect(processManager.isRunning()).toBe(false);
    });

    test('should restart process successfully', async () => {
      // Setup for restart
      process.nextTick(() => {
        mockProcess.stdout.emit('data', Buffer.from('Ready'));
      });
      
      await processManager.restart();
      
      expect(processManager.isRunning()).toBe(true);
    });

    test('should correctly report running status', () => {
      expect(processManager.isRunning()).toBe(true);
      
      // Stop and check status
      mockProcess.kill('SIGTERM');
      expect(processManager.isRunning()).toBe(false);
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should handle process spawn error', async () => {
      const projectPath = '/test/project';
      const spawnError = new Error('Spawn failed');
      
      process.nextTick(() => {
        mockProcess.emit('error', spawnError);
      });
      
      await expect(processManager.start(projectPath)).rejects.toThrow('Spawn failed');
      expect(processManager.isRunning()).toBe(false);
    });

    test('should handle process exit with error code', async () => {
      const projectPath = '/test/project';
      
      process.nextTick(() => {
        mockProcess.emit('exit', 1, null);
      });
      
      await expect(processManager.start(projectPath)).rejects.toThrow('Process exited with code 1');
      expect(processManager.isRunning()).toBe(false);
    });

    test('should emit error events', async () => {
      const errorHandler = jest.fn();
      processManager.on('error', errorHandler);
      
      const projectPath = '/test/project';
      const testError = new Error('Test error');
      
      process.nextTick(() => {
        mockProcess.emit('error', testError);
      });
      
      await expect(processManager.start(projectPath)).rejects.toThrow();
      expect(errorHandler).toHaveBeenCalledWith(testError);
    });

    test('should cleanup properly on error', async () => {
      const projectPath = '/test/project';
      
      process.nextTick(() => {
        mockProcess.emit('error', new Error('Test error'));
      });
      
      await expect(processManager.start(projectPath)).rejects.toThrow();
      expect(processManager.isRunning()).toBe(false);
    });
  });

  describe('Output Stream Handling', () => {
    test('should capture and emit stdout data', async () => {
      const stdoutHandler = jest.fn();
      processManager.on('stdout', stdoutHandler);
      
      const projectPath = '/test/project';
      const testOutput = 'Test stdout output';
      
      process.nextTick(() => {
        mockProcess.stdout.emit('data', Buffer.from('Ready'));
        mockProcess.stdout.emit('data', Buffer.from(testOutput));
      });
      
      await processManager.start(projectPath);
      
      expect(stdoutHandler).toHaveBeenCalledWith(testOutput);
    });

    test('should capture and emit stderr data', async () => {
      const stderrHandler = jest.fn();
      processManager.on('stderr', stderrHandler);
      
      const projectPath = '/test/project';
      const testError = 'Test stderr output';
      
      process.nextTick(() => {
        mockProcess.stdout.emit('data', Buffer.from('Ready'));
        mockProcess.stderr.emit('data', Buffer.from(testError));
      });
      
      await processManager.start(projectPath);
      
      expect(stderrHandler).toHaveBeenCalledWith(testError);
    });

    test('should store output in buffer', async () => {
      const projectPath = '/test/project';
      const outputs = ['Output 1', 'Output 2', 'Ready'];
      
      process.nextTick(() => {
        outputs.forEach(output => {
          mockProcess.stdout.emit('data', Buffer.from(output));
        });
      });
      
      await processManager.start(projectPath);
      
      const buffer = processManager.getOutputBuffer();
      expect(buffer).toContain('Output 1');
      expect(buffer).toContain('Output 2');
      expect(buffer).toContain('Ready');
    });

    test('should clear output buffer', async () => {
      const projectPath = '/test/project';
      
      process.nextTick(() => {
        mockProcess.stdout.emit('data', Buffer.from('Ready'));
        mockProcess.stdout.emit('data', Buffer.from('Test output'));
      });
      
      await processManager.start(projectPath);
      
      expect(processManager.getOutputBuffer().length).toBeGreaterThan(0);
      
      processManager.clearOutputBuffer();
      expect(processManager.getOutputBuffer()).toEqual([]);
    });

    test('should emit exit events', async () => {
      const exitHandler = jest.fn();
      processManager.on('exit', exitHandler);
      
      const projectPath = '/test/project';
      
      process.nextTick(() => {
        mockProcess.stdout.emit('data', Buffer.from('Ready'));
      });
      
      await processManager.start(projectPath);
      
      // Trigger exit
      mockProcess.emit('exit', 0, null);
      
      expect(exitHandler).toHaveBeenCalledWith(0, null);
    });
  });

  describe('Event Management', () => {
    test('should support event listeners', async () => {
      const stdoutHandler = jest.fn();
      const stderrHandler = jest.fn();
      const exitHandler = jest.fn();
      const errorHandler = jest.fn();
      
      processManager.on('stdout', stdoutHandler);
      processManager.on('stderr', stderrHandler);
      processManager.on('exit', exitHandler);
      processManager.on('error', errorHandler);
      
      const projectPath = '/test/project';
      
      process.nextTick(() => {
        mockProcess.stdout.emit('data', Buffer.from('Ready'));
        mockProcess.stderr.emit('data', Buffer.from('Error message'));
        mockProcess.emit('exit', 0, null);
      });
      
      await processManager.start(projectPath);
      
      expect(stdoutHandler).toHaveBeenCalled();
      expect(stderrHandler).toHaveBeenCalled();
      expect(exitHandler).toHaveBeenCalled();
    });

    test('should support removing event listeners', () => {
      const handler = jest.fn();
      
      processManager.on('stdout', handler);
      processManager.off('stdout', handler);
      
      // Verify listener was removed by checking internal EventEmitter state
      expect(processManager.listenerCount('stdout')).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    test('should handle stop when not running', async () => {
      // Should not throw when stopping non-running process
      await expect(processManager.stop()).resolves.toBeUndefined();
    });

    test('should fail to restart without stored project path', async () => {
      // Create fresh process manager without starting
      const freshManager = new ProcessManager();
      
      await expect(freshManager.restart()).rejects.toThrow('Cannot restart: no project path stored');
    });

    test('should detect ready signal in stderr', async () => {
      const projectPath = '/test/project';
      
      process.nextTick(() => {
        mockProcess.stderr.emit('data', Buffer.from('Ready on http://localhost:3000'));
      });
      
      await processManager.start(projectPath);
      expect(processManager.isRunning()).toBe(true);
    });
  });

  describe('Graceful Shutdown', () => {
    test('should setup process exit handlers', () => {
      // Verify that process exit handlers are set up
      const processSpy = jest.spyOn(process, 'on');
      
      new ProcessManager();
      
      expect(processSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(processSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(processSpy).toHaveBeenCalledWith('beforeExit', expect.any(Function));
      
      processSpy.mockRestore();
    });
  });
});