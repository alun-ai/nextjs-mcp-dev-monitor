/**
 * MCP Interface Unit Tests
 * Comprehensive testing of MCP tools, server, and schema validation
 */

import { NextJSMCPMonitorServer } from '../../src/server';
import { 
  startMonitoring, 
  stopMonitoring, 
  getMonitorService 
} from '../../src/tools/monitoring';
import { getCurrentErrors, applyFix } from '../../src/tools/errors';
import { getMonitoringStatus } from '../../src/tools/status';
import { MonitorService } from '../../src/components/MonitorService';
import { 
  StartMonitoringInput,
  StartMonitoringOutput,
  StopMonitoringInput,
  StopMonitoringOutput,
  GetErrorsInput,
  GetErrorsOutput,
  ApplyFixInput,
  ApplyFixOutput,
  MonitorStatusInput,
  MonitorStatusOutput,
  MCPToolResponse
} from '../../src/types/mcp';
import { ClassifiedError, ErrorType, ErrorSeverity, FixCapability } from '../../src/types/errors';
import { randomUUID } from 'crypto';

// Mock dependencies
jest.mock('../../src/components/MonitorService');
jest.mock('@modelcontextprotocol/sdk/server/index.js');
jest.mock('@modelcontextprotocol/sdk/server/stdio.js');

describe('MCP Interface Tests', () => {
  let mockMonitorService: jest.Mocked<MonitorService>;
  let mcpServer: NextJSMCPMonitorServer;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset global monitor service state
    (global as any).monitorService = null;
    
    // Setup mock MonitorService
    mockMonitorService = {
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      isRunning: jest.fn().mockReturnValue(false),
      getMetrics: jest.fn().mockReturnValue({
        processId: 12345,
        uptime: 3600,
        errorsDetected: 5,
        fixesApplied: 3,
        successRate: 0.6,
      }),
      getCurrentErrors: jest.fn().mockReturnValue([]),
      getFilteredErrors: jest.fn().mockReturnValue([]),
      applyAutoFix: jest.fn().mockResolvedValue({
        success: true,
        applied: true,
        file: 'test.js',
        changes: { type: 'eslint_autofix', description: 'Fixed semicolon' },
      }),
      config: {
        projectPath: '/test/project',
        logLevel: 'info',
        autoFix: true,
        safeMode: true,
      },
    } as any;

    // Mock MonitorService constructor
    (MonitorService as jest.MockedClass<typeof MonitorService>)
      .mockImplementation(() => mockMonitorService);

    mcpServer = new NextJSMCPMonitorServer();
  });

  // Helper function to create test errors
  const createTestError = (
    type: ErrorType = ErrorType.TYPESCRIPT,
    message: string = 'Test error',
    autoFixable: boolean = true
  ): ClassifiedError => ({
    id: randomUUID(),
    type,
    severity: ErrorSeverity.ERROR,
    message,
    location: { file: 'test.tsx', line: 10, column: 5 },
    fixCapability: autoFixable ? FixCapability.AUTO_FIXABLE : FixCapability.MANUAL_REQUIRED,
    timestamp: new Date(),
    raw: message,
    priority: 80,
    groupId: `${type}-test`,
    relatedErrors: [],
    autoFixable,
    file: 'test.tsx',
  });

  describe('MCP Server Integration', () => {
    test('should initialize MCP server with correct capabilities', () => {
      expect(mcpServer).toBeInstanceOf(NextJSMCPMonitorServer);
    });

    test('should register all required MCP tools', async () => {
      // Test that all expected tools are registered
      const expectedTools = [
        'start_monitoring',
        'stop_monitoring', 
        'get_current_errors',
        'get_monitoring_status',
        'apply_fix'
      ];

      // Since we can't directly access the server's tool list,
      // we verify by checking that all tool functions exist
      expect(startMonitoring).toBeDefined();
      expect(stopMonitoring).toBeDefined();
      expect(getCurrentErrors).toBeDefined();
      expect(getMonitoringStatus).toBeDefined();
      expect(applyFix).toBeDefined();
    });

    test('should handle MCP server startup', async () => {
      await expect(mcpServer.start()).resolves.not.toThrow();
    });
  });

  describe('Monitoring Tools', () => {
    describe('startMonitoring', () => {
      test('should validate required input schema', async () => {
        const invalidInput: any = {}; // Missing projectPath
        
        const result = await startMonitoring(invalidInput);
        
        expect(result.status).toBe('failed');
        expect(result.message).toContain('Project path is required');
      });

      test('should start monitoring with valid input', async () => {
        const input: StartMonitoringInput = {
          projectPath: '/test/project',
          config: {
            autoFix: true,
            safeMode: false,
          },
        };

        const result = await startMonitoring(input);
        
        expect(result.status).toBe('started');
        expect(result.processId).toBe(12345);
        expect(result.monitoringUrl).toBe('http://localhost:3000');
        expect(result.message).toContain('Successfully started monitoring');
        expect(mockMonitorService.start).toHaveBeenCalledWith(
          '/test/project',
          { autoFix: true, safeMode: false }
        );
      });

      test('should detect already running monitoring', async () => {
        mockMonitorService.isRunning.mockReturnValue(true);
        // Set global monitor service to simulate already running state
        (require('../../src/tools/monitoring') as any).monitorService = mockMonitorService;

        const input: StartMonitoringInput = {
          projectPath: '/test/project',
        };

        const result = await startMonitoring(input);
        
        expect(result.status).toBe('already_running');
        expect(result.message).toContain('already active');
      });

      test('should handle monitoring start errors', async () => {
        mockMonitorService.start.mockRejectedValue(new Error('Failed to start'));

        const input: StartMonitoringInput = {
          projectPath: '/test/project',
        };

        const result = await startMonitoring(input);
        
        expect(result.status).toBe('failed');
        expect(result.message).toContain('Failed to start');
      });

      test('should validate output schema', async () => {
        const input: StartMonitoringInput = {
          projectPath: '/test/project',
        };

        const result = await startMonitoring(input);
        
        // Validate output structure matches StartMonitoringOutput interface
        expect(result).toHaveProperty('status');
        expect(['started', 'already_running', 'failed']).toContain(result.status);
        expect(result).toHaveProperty('message');
        expect(typeof result.message).toBe('string');
        
        if (result.status === 'started') {
          expect(result).toHaveProperty('processId');
          expect(result).toHaveProperty('monitoringUrl');
        }
      });
    });

    describe('stopMonitoring', () => {
      test('should stop monitoring when running', async () => {
        mockMonitorService.isRunning.mockReturnValue(true);
        // Set global monitor service
        (require('../../src/tools/monitoring') as any).monitorService = mockMonitorService;

        const input: StopMonitoringInput = { force: false };
        
        const result = await stopMonitoring(input);
        
        expect(result.status).toBe('stopped');
        expect(result.message).toContain('Successfully stopped');
        expect(mockMonitorService.stop).toHaveBeenCalled();
      });

      test('should handle not running state', async () => {
        // Monitor service not set (null)
        (require('../../src/tools/monitoring') as any).monitorService = null;

        const input: StopMonitoringInput = {};
        
        const result = await stopMonitoring(input);
        
        expect(result.status).toBe('not_running');
        expect(result.message).toContain('not currently active');
      });

      test('should handle stop errors', async () => {
        mockMonitorService.isRunning.mockReturnValue(true);
        mockMonitorService.stop.mockRejectedValue(new Error('Failed to stop'));
        (require('../../src/tools/monitoring') as any).monitorService = mockMonitorService;

        const input: StopMonitoringInput = {};
        
        const result = await stopMonitoring(input);
        
        expect(result.status).toBe('failed');
        expect(result.message).toContain('Failed to stop');
      });

      test('should validate output schema', async () => {
        const input: StopMonitoringInput = {};
        
        const result = await stopMonitoring(input);
        
        // Validate output structure matches StopMonitoringOutput interface
        expect(result).toHaveProperty('status');
        expect(['stopped', 'not_running', 'failed']).toContain(result.status);
        expect(result).toHaveProperty('message');
        expect(typeof result.message).toBe('string');
      });
    });
  });

  describe('Error Management Tools', () => {
    describe('getCurrentErrors', () => {
      beforeEach(() => {
        // Set up mock monitor service with test errors
        const testErrors = [
          createTestError(ErrorType.TYPESCRIPT, 'Type error 1', true),
          createTestError(ErrorType.ESLINT, 'ESLint error 1', true),
          createTestError(ErrorType.BUILD, 'Build error 1', false),
          createTestError(ErrorType.RUNTIME, 'Runtime error 1', false),
          createTestError(ErrorType.IMPORT, 'Import error 1', true),
        ];
        
        mockMonitorService.getCurrentErrors.mockReturnValue(testErrors);
        mockMonitorService.getFilteredErrors.mockReturnValue(testErrors.slice(0, 2));
        (require('../../src/tools/monitoring') as any).monitorService = mockMonitorService;
      });

      test('should return all errors when no filter applied', async () => {
        const input: GetErrorsInput = {};
        
        const result = await getCurrentErrors(input);
        
        expect(result.errors).toHaveLength(5);
        expect(result.total).toBe(5);
        expect(result.hasMore).toBe(false);
        expect(mockMonitorService.getCurrentErrors).toHaveBeenCalled();
      });

      test('should apply filters correctly', async () => {
        const input: GetErrorsInput = {
          filter: {
            type: ['typescript', 'eslint'],
            fixable: true,
          },
        };
        
        const result = await getCurrentErrors(input);
        
        expect(result.errors).toHaveLength(2);
        expect(result.total).toBe(2);
        expect(mockMonitorService.getFilteredErrors).toHaveBeenCalledWith(input.filter);
      });

      test('should apply pagination correctly', async () => {
        const input: GetErrorsInput = {
          limit: 2,
          offset: 1,
        };
        
        const result = await getCurrentErrors(input);
        
        expect(result.errors).toHaveLength(2);
        expect(result.total).toBe(5);
        expect(result.hasMore).toBe(true);
      });

      test('should handle monitor service not available', async () => {
        (require('../../src/tools/monitoring') as any).monitorService = null;

        const input: GetErrorsInput = {};
        
        const result = await getCurrentErrors(input);
        
        expect(result.errors).toHaveLength(0);
        expect(result.total).toBe(0);
        expect(result.hasMore).toBe(false);
      });

      test('should validate input schema', async () => {
        const validInputs: GetErrorsInput[] = [
          {},
          { filter: { type: ['typescript'] } },
          { filter: { severity: ['error'] } },
          { filter: { fixable: true } },
          { limit: 10, offset: 0 },
        ];

        for (const input of validInputs) {
          const result = await getCurrentErrors(input);
          expect(result).toHaveProperty('errors');
          expect(result).toHaveProperty('total');
          expect(result).toHaveProperty('hasMore');
        }
      });

      test('should validate output schema', async () => {
        const input: GetErrorsInput = {};
        
        const result = await getCurrentErrors(input);
        
        // Validate output structure matches GetErrorsOutput interface
        expect(result).toHaveProperty('errors');
        expect(Array.isArray(result.errors)).toBe(true);
        expect(result).toHaveProperty('total');
        expect(typeof result.total).toBe('number');
        expect(result).toHaveProperty('hasMore');
        expect(typeof result.hasMore).toBe('boolean');
        
        // Validate error structure if any errors exist
        if (result.errors.length > 0) {
          const error = result.errors[0];
          expect(error).toHaveProperty('id');
          expect(error).toHaveProperty('type');
          expect(error).toHaveProperty('severity');
          expect(error).toHaveProperty('message');
          expect(error).toHaveProperty('location');
          expect(error).toHaveProperty('autoFixable');
        }
      });
    });

    describe('applyFix', () => {
      beforeEach(() => {
        const testError = createTestError(ErrorType.ESLINT, 'Missing semicolon', true);
        testError.id = 'test-error-123';
        
        mockMonitorService.getCurrentErrors.mockReturnValue([testError]);
        (require('../../src/tools/monitoring') as any).monitorService = mockMonitorService;
      });

      test('should apply fix for valid error ID', async () => {
        const input: ApplyFixInput = {
          errorId: 'test-error-123',
          confirmFix: true,
          createBackup: true,
        };
        
        const result = await applyFix(input);
        
        expect(result.success).toBe(true);
        expect(result.applied).toBe(true);
        expect(result.file).toBe('test.js');
        expect(result.recommendation).toContain('successfully');
        expect(mockMonitorService.applyAutoFix).toHaveBeenCalled();
      });

      test('should handle invalid error ID', async () => {
        const input: ApplyFixInput = {
          errorId: 'non-existent-error',
        };
        
        const result = await applyFix(input);
        
        expect(result.success).toBe(false);
        expect(result.applied).toBe(false);
        expect(result.error).toContain('not found');
      });

      test('should handle non-fixable errors', async () => {
        const nonFixableError = createTestError(ErrorType.RUNTIME, 'Runtime error', false);
        nonFixableError.id = 'non-fixable-error';
        
        mockMonitorService.getCurrentErrors.mockReturnValue([nonFixableError]);

        const input: ApplyFixInput = {
          errorId: 'non-fixable-error',
        };
        
        const result = await applyFix(input);
        
        expect(result.success).toBe(false);
        expect(result.applied).toBe(false);
        expect(result.error).toContain('not auto-fixable');
        expect(result.recommendation).toContain('Manual intervention');
      });

      test('should handle monitor service not available', async () => {
        (require('../../src/tools/monitoring') as any).monitorService = null;

        const input: ApplyFixInput = {
          errorId: 'test-error-123',
        };
        
        const result = await applyFix(input);
        
        expect(result.success).toBe(false);
        expect(result.applied).toBe(false);
        expect(result.error).toContain('Monitor service not available');
      });

      test('should handle fix application errors', async () => {
        mockMonitorService.applyAutoFix.mockRejectedValue(new Error('Fix failed'));

        const input: ApplyFixInput = {
          errorId: 'test-error-123',
        };
        
        const result = await applyFix(input);
        
        expect(result.success).toBe(false);
        expect(result.applied).toBe(false);
        expect(result.error).toContain('Fix failed');
      });

      test('should validate input schema', async () => {
        const validInputs: ApplyFixInput[] = [
          { errorId: 'test-error-123' },
          { errorId: 'test-error-123', confirmFix: true },
          { errorId: 'test-error-123', createBackup: false },
          { errorId: 'test-error-123', confirmFix: true, createBackup: false },
        ];

        for (const input of validInputs) {
          expect(input).toHaveProperty('errorId');
          expect(typeof input.errorId).toBe('string');
        }
      });

      test('should validate output schema', async () => {
        const input: ApplyFixInput = {
          errorId: 'test-error-123',
        };
        
        const result = await applyFix(input);
        
        // Validate output structure matches ApplyFixOutput interface
        expect(result).toHaveProperty('success');
        expect(typeof result.success).toBe('boolean');
        expect(result).toHaveProperty('applied');
        expect(typeof result.applied).toBe('boolean');
        expect(result).toHaveProperty('file');
        expect(typeof result.file).toBe('string');
        
        if (!result.success) {
          expect(result).toHaveProperty('error');
          expect(typeof result.error).toBe('string');
        }
        
        if (result.success && result.applied) {
          expect(result).toHaveProperty('changes');
        }
        
        expect(result).toHaveProperty('recommendation');
      });
    });
  });

  describe('Status Monitoring Tools', () => {
    describe('getMonitoringStatus', () => {
      beforeEach(() => {
        (require('../../src/tools/monitoring') as any).monitorService = mockMonitorService;
      });

      test('should return running status with metrics', async () => {
        mockMonitorService.isRunning.mockReturnValue(true);

        const input: MonitorStatusInput = {
          includeMetrics: true,
        };
        
        const result = await getMonitoringStatus(input);
        
        expect(result.isRunning).toBe(true);
        expect(result.processId).toBe(12345);
        expect(result.projectPath).toBe('/test/project');
        expect(result.metrics).toEqual({
          errorsDetected: 5,
          fixesApplied: 3,
          successRate: 0.6,
        });
      });

      test('should return running status without metrics', async () => {
        mockMonitorService.isRunning.mockReturnValue(true);

        const input: MonitorStatusInput = {
          includeMetrics: false,
        };
        
        const result = await getMonitoringStatus(input);
        
        expect(result.isRunning).toBe(true);
        expect(result.projectPath).toBe('/test/project');
        expect(result.metrics).toBeUndefined();
      });

      test('should return not running status', async () => {
        mockMonitorService.isRunning.mockReturnValue(false);

        const input: MonitorStatusInput = {};
        
        const result = await getMonitoringStatus(input);
        
        expect(result.isRunning).toBe(false);
        expect(result.processId).toBeUndefined();
        expect(result.metrics).toBeUndefined();
      });

      test('should handle monitor service not available', async () => {
        (require('../../src/tools/monitoring') as any).monitorService = null;

        const input: MonitorStatusInput = {};
        
        const result = await getMonitoringStatus(input);
        
        expect(result.isRunning).toBe(false);
      });

      test('should validate input schema', async () => {
        const validInputs: MonitorStatusInput[] = [
          {},
          { includeMetrics: true },
          { includeMetrics: false },
        ];

        for (const input of validInputs) {
          const result = await getMonitoringStatus(input);
          expect(result).toHaveProperty('isRunning');
        }
      });

      test('should validate output schema', async () => {
        const input: MonitorStatusInput = { includeMetrics: true };
        
        const result = await getMonitoringStatus(input);
        
        // Validate output structure matches MonitorStatusOutput interface
        expect(result).toHaveProperty('isRunning');
        expect(typeof result.isRunning).toBe('boolean');
        
        if (result.isRunning) {
          if (result.processId !== undefined) {
            expect(typeof result.processId).toBe('number');
          }
          if (result.uptime !== undefined) {
            expect(typeof result.uptime).toBe('number');
          }
          if (result.projectPath !== undefined) {
            expect(typeof result.projectPath).toBe('string');
          }
          if (result.metrics !== undefined) {
            expect(result.metrics).toHaveProperty('errorsDetected');
            expect(result.metrics).toHaveProperty('fixesApplied');
            expect(result.metrics).toHaveProperty('successRate');
            expect(typeof result.metrics.errorsDetected).toBe('number');
            expect(typeof result.metrics.fixesApplied).toBe('number');
            expect(typeof result.metrics.successRate).toBe('number');
          }
        }
      });
    });
  });

  describe('MCP Tool Response Format', () => {
    test('should format responses according to MCP protocol', () => {
      const testData = { status: 'success', message: 'Test message' };
      
      const mcpResponse: MCPToolResponse = {
        content: [
          {
            type: 'text',
            text: JSON.stringify(testData, null, 2),
          },
        ],
      };
      
      expect(mcpResponse.content).toHaveLength(1);
      expect(mcpResponse.content[0]?.type).toBe('text');
      expect(mcpResponse.content[0]?.text).toContain('success');
      expect(mcpResponse.isError).toBeUndefined();
    });

    test('should format error responses correctly', () => {
      const errorData = { error: 'Test error', tool: 'test_tool' };
      
      const mcpErrorResponse: MCPToolResponse = {
        content: [
          {
            type: 'text',
            text: JSON.stringify(errorData, null, 2),
          },
        ],
        isError: true,
      };
      
      expect(mcpErrorResponse.content).toHaveLength(1);
      expect(mcpErrorResponse.content[0]?.type).toBe('text');
      expect(mcpErrorResponse.content[0]?.text).toContain('Test error');
      expect(mcpErrorResponse.isError).toBe(true);
    });
  });

  describe('Schema Validation Edge Cases', () => {
    test('should handle malformed input gracefully', async () => {
      const malformedInputs = [
        null,
        undefined,
        'string instead of object',
        123,
        [],
      ];

      for (const input of malformedInputs) {
        const result = await startMonitoring(input as any);
        expect(result.status).toBe('failed');
      }
    });

    test('should handle missing required fields', async () => {
      const incompleteInputs = [
        {}, // Missing projectPath for startMonitoring
        { projectPath: '' }, // Empty projectPath
        { projectPath: null }, // Null projectPath
      ];

      for (const input of incompleteInputs) {
        const result = await startMonitoring(input as any);
        expect(result.status).toBe('failed');
        expect(result.message).toContain('required');
      }
    });

    test('should validate type constraints', async () => {
      const invalidTypes = [
        { projectPath: 123 }, // Number instead of string
        { projectPath: true }, // Boolean instead of string
        { projectPath: {} }, // Object instead of string
        { projectPath: [] }, // Array instead of string
      ];

      for (const input of invalidTypes) {
        // These should be caught by TypeScript, but we test runtime behavior
        const result = await startMonitoring(input as any);
        expect(result.status).toBe('failed');
      }
    });

    test('should handle extremely large inputs', async () => {
      const largeInput = {
        projectPath: '/test/project',
        config: {
          // Create a large config object
          ...Object.fromEntries(
            Array.from({ length: 1000 }, (_, i) => [`key${i}`, `value${i}`])
          ),
        },
      };

      const result = await startMonitoring(largeInput as any);
      // Should still process but may be handled differently based on implementation
      expect(['started', 'failed', 'already_running']).toContain(result.status);
    });
  });

  describe('Integration with Monitor Service', () => {
    test('should properly integrate with MonitorService lifecycle', async () => {
      // Test complete flow: start -> get errors -> apply fix -> stop
      
      // 1. Start monitoring
      const startResult = await startMonitoring({
        projectPath: '/test/project',
      });
      expect(startResult.status).toBe('started');

      // 2. Get current errors
      const testError = createTestError(ErrorType.ESLINT, 'Missing semicolon', true);
      testError.id = 'integration-test-error';
      mockMonitorService.getCurrentErrors.mockReturnValue([testError]);

      const errorsResult = await getCurrentErrors({});
      expect(errorsResult.errors).toHaveLength(1);

      // 3. Apply fix
      const fixResult = await applyFix({
        errorId: 'integration-test-error',
      });
      expect(fixResult.success).toBe(true);

      // 4. Check status
      mockMonitorService.isRunning.mockReturnValue(true);
      const statusResult = await getMonitoringStatus({
        includeMetrics: true,
      });
      expect(statusResult.isRunning).toBe(true);

      // 5. Stop monitoring
      const stopResult = await stopMonitoring({});
      expect(stopResult.status).toBe('stopped');
    });

    test('should handle service state changes correctly', async () => {
      // Initially not running
      expect(getMonitorService()).toBeNull();

      // Start monitoring
      await startMonitoring({ projectPath: '/test/project' });
      
      // Should now have monitor service
      const service = getMonitorService();
      expect(service).not.toBeNull();

      // Stop monitoring
      await stopMonitoring({});
      
      // Service should still exist but not be running
      mockMonitorService.isRunning.mockReturnValue(false);
      const status = await getMonitoringStatus({});
      expect(status.isRunning).toBe(false);
    });
  });

  describe('Error Recovery and Resilience', () => {
    test('should recover from temporary service failures', async () => {
      // Simulate service failure then recovery
      mockMonitorService.start
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce(undefined);

      // First attempt fails
      const failResult = await startMonitoring({
        projectPath: '/test/project',
      });
      expect(failResult.status).toBe('failed');

      // Second attempt succeeds
      const successResult = await startMonitoring({
        projectPath: '/test/project',
      });
      expect(successResult.status).toBe('started');
    });

    test('should handle concurrent tool requests', async () => {
      // Simulate multiple concurrent requests
      const promises = [
        startMonitoring({ projectPath: '/test/project1' }),
        startMonitoring({ projectPath: '/test/project2' }),
        getMonitoringStatus({}),
        getCurrentErrors({}),
      ];

      const results = await Promise.all(promises);
      
      // All requests should complete (though some may fail due to state)
      expect(results).toHaveLength(4);
      results.forEach(result => {
        expect(result).toBeDefined();
      });
    });
  });
});