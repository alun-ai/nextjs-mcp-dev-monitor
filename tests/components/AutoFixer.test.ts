/**
 * AutoFixer Unit Tests
 * Comprehensive testing of automated fix system with backup management and safety mechanisms
 */

import { AutoFixer } from '../../src/components/AutoFixer';
import { ClassifiedError, ErrorType, ErrorSeverity, FixCapability } from '../../src/types/errors';
import { MonitorConfig } from '../../src/types/config';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ESLint } from 'eslint';

// Mock dependencies
jest.mock('fs/promises');
jest.mock('eslint');
jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => 'test-uuid-123'),
  createHash: jest.fn(() => ({
    update: jest.fn(() => ({
      digest: jest.fn(() => 'test-checksum-456'),
    })),
  })),
}));

describe('AutoFixer', () => {
  let autoFixer: AutoFixer;
  let mockConfig: MonitorConfig;
  let mockFs: jest.Mocked<typeof fs>;
  let mockESLint: jest.MockedClass<typeof ESLint>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup mock filesystem
    mockFs = fs as jest.Mocked<typeof fs>;
    mockFs.mkdir = jest.fn().mockResolvedValue(undefined);
    mockFs.access = jest.fn().mockResolvedValue(undefined);
    mockFs.readFile = jest.fn().mockResolvedValue('test file content');
    mockFs.writeFile = jest.fn().mockResolvedValue(undefined);
    mockFs.copyFile = jest.fn().mockResolvedValue(undefined);
    mockFs.unlink = jest.fn().mockResolvedValue(undefined);
    mockFs.readdir = jest.fn().mockResolvedValue([]);
    mockFs.stat = jest.fn().mockResolvedValue({
      isFile: () => true,
      size: 1024,
    } as any);

    // Setup mock ESLint
    mockESLint = ESLint as jest.MockedClass<typeof ESLint>;
    mockESLint.prototype.lintFiles = jest.fn().mockResolvedValue([
      {
        filePath: 'test.js',
        output: 'fixed content',
        errorCount: 0,
        warningCount: 0,
        fixableErrorCount: 1,
        fixableWarningCount: 0,
        fatalErrorCount: 0,
        messages: [],
      },
    ]);

    // Setup test config
    mockConfig = {
      projectPath: '/test/project',
      logLevel: 'info',
      autoFix: true,
      safeMode: false,
      backupEnabled: true,
      backupRetentionDays: 7,
      validateFixes: true,
      maxFileSizeAfterFix: 1024 * 1024,
    };

    autoFixer = new AutoFixer(mockConfig);
  });

  // Helper function to create test errors
  const createTestError = (
    type: ErrorType,
    message: string,
    file: string = 'test.tsx',
    severity: ErrorSeverity = ErrorSeverity.ERROR,
    fixCapability: FixCapability = FixCapability.AUTO_FIXABLE,
    code?: string,
    rule?: string
  ): ClassifiedError => ({
    id: randomUUID(),
    type,
    severity,
    message,
    code,
    rule,
    location: {
      file,
      line: 10,
      column: 5,
    },
    fixCapability,
    timestamp: new Date(),
    raw: message,
    priority: 80,
    groupId: `${type}-test`,
    relatedErrors: [],
    autoFixable: fixCapability === FixCapability.AUTO_FIXABLE,
    file,
  });

  describe('Initialization and Setup', () => {
    test('should initialize with correct configuration', () => {
      expect(autoFixer).toBeInstanceOf(AutoFixer);
      expect(mockFs.mkdir).toHaveBeenCalledWith('/test/project/.nextjs-monitor-backups', { recursive: true });
    });

    test('should load existing backup metadata', async () => {
      mockFs.access = jest.fn().mockResolvedValue(undefined);
      mockFs.readFile = jest.fn().mockResolvedValue(JSON.stringify({
        'backup-1': {
          id: 'backup-1',
          filePath: 'test.js',
          timestamp: '2023-01-01T00:00:00.000Z',
          originalSize: 500,
          checksum: 'abc123',
          fixType: 'eslint',
          description: 'Test backup',
        },
      }));

      const newFixer = new AutoFixer(mockConfig);
      expect(mockFs.readFile).toHaveBeenCalled();
    });

    test('should handle missing metadata file gracefully', async () => {
      mockFs.access = jest.fn().mockRejectedValue(new Error('File not found'));
      
      const newFixer = new AutoFixer(mockConfig);
      expect(newFixer).toBeInstanceOf(AutoFixer);
    });
  });

  describe('Core Interface Methods', () => {
    describe('canFix', () => {
      test('should return true for ESLint errors when ESLint is available', () => {
        const error = createTestError(ErrorType.ESLINT, 'Missing semicolon');
        expect(autoFixer.canFix(error)).toBe(true);
      });

      test('should return true for TypeScript errors with known patterns', () => {
        const error = createTestError(ErrorType.TYPESCRIPT, 'Cannot find name "React"');
        expect(autoFixer.canFix(error)).toBe(true);
      });

      test('should return true for import errors with module resolution issues', () => {
        const error = createTestError(ErrorType.IMPORT, 'Module not found: Can\'t resolve \'react\'');
        expect(autoFixer.canFix(error)).toBe(true);
      });

      test('should return false for unknown error types', () => {
        const error = createTestError(ErrorType.UNKNOWN, 'Unknown error');
        expect(autoFixer.canFix(error)).toBe(false);
      });

      test('should return false for runtime errors by default', () => {
        const error = createTestError(ErrorType.RUNTIME, 'TypeError: Cannot read property');
        expect(autoFixer.canFix(error)).toBe(false);
      });
    });

    describe('applyFix', () => {
      test('should successfully apply ESLint fix with backup', async () => {
        const error = createTestError(ErrorType.ESLINT, 'Missing semicolon', 'test.js');
        
        const result = await autoFixer.applyFix(error);
        
        expect(result.success).toBe(true);
        expect(result.applied).toBe(true);
        expect(result.file).toBe('test.js');
        expect(result.changes).toBeDefined();
        expect(mockFs.writeFile).toHaveBeenCalled();
      });

      test('should create backup before applying fix when enabled', async () => {
        mockConfig.backupEnabled = true;
        const error = createTestError(ErrorType.ESLINT, 'Missing semicolon', 'test.js');
        
        await autoFixer.applyFix(error);
        
        expect(mockFs.copyFile).toHaveBeenCalled();
        expect(mockFs.writeFile).toHaveBeenCalledWith(
          expect.stringContaining('metadata.json'),
          expect.any(String),
          'utf8'
        );
      });

      test('should skip backup when disabled', async () => {
        mockConfig.backupEnabled = false;
        autoFixer = new AutoFixer(mockConfig);
        const error = createTestError(ErrorType.ESLINT, 'Missing semicolon', 'test.js');
        
        await autoFixer.applyFix(error);
        
        expect(mockFs.copyFile).not.toHaveBeenCalled();
      });

      test('should validate fix when validation enabled', async () => {
        mockConfig.validateFixes = true;
        autoFixer = new AutoFixer(mockConfig);
        const error = createTestError(ErrorType.ESLINT, 'Missing semicolon', 'test.js');
        
        await autoFixer.applyFix(error);
        
        expect(mockFs.stat).toHaveBeenCalled();
      });

      test('should restore backup if fix validation fails', async () => {
        mockConfig.validateFixes = true;
        mockConfig.backupEnabled = true;
        mockFs.stat = jest.fn().mockResolvedValue({
          isFile: () => true,
          size: 2 * 1024 * 1024, // Exceed max file size
        } as any);
        
        autoFixer = new AutoFixer(mockConfig);
        const error = createTestError(ErrorType.ESLINT, 'Missing semicolon', 'test.js');
        
        const result = await autoFixer.applyFix(error);
        
        expect(result.success).toBe(false);
        expect(result.error).toContain('validation failed');
      });

      test('should respect safe mode restrictions', async () => {
        mockConfig.safeMode = true;
        autoFixer = new AutoFixer(mockConfig);
        const error = createTestError(ErrorType.BUILD, 'Complex build error', 'next.config.js');
        
        const result = await autoFixer.applyFix(error);
        
        expect(result.success).toBe(false);
        expect(result.error).toContain('safe mode');
      });

      test('should handle fix application errors gracefully', async () => {
        mockFs.readFile = jest.fn().mockRejectedValue(new Error('File read error'));
        const error = createTestError(ErrorType.ESLINT, 'Missing semicolon', 'test.js');
        
        const result = await autoFixer.applyFix(error);
        
        expect(result.success).toBe(false);
        expect(result.error).toContain('File read error');
      });
    });
  });

  describe('Error Type Specific Fixes', () => {
    describe('ESLint Fixes', () => {
      test('should apply ESLint auto-fixes successfully', async () => {
        const error = createTestError(ErrorType.ESLINT, 'Missing semicolon', 'test.js');
        
        const result = await autoFixer.applyFix(error);
        
        expect(result.success).toBe(true);
        expect(result.changes?.type).toBe('eslint_autofix');
        expect(mockESLint.prototype.lintFiles).toHaveBeenCalledWith(['test.js']);
      });

      test('should handle ESLint not available', async () => {
        // Create AutoFixer without ESLint
        const configWithoutESLint = { ...mockConfig };
        mockESLint.mockImplementation(() => {
          throw new Error('ESLint not found');
        });
        
        const fixerWithoutESLint = new AutoFixer(configWithoutESLint);
        const error = createTestError(ErrorType.ESLINT, 'Missing semicolon', 'test.js');
        
        const result = await fixerWithoutESLint.applyFix(error);
        
        expect(result.success).toBe(false);
        expect(result.error).toContain('ESLint not available');
      });

      test('should handle no ESLint output available', async () => {
        mockESLint.prototype.lintFiles = jest.fn().mockResolvedValue([
          {
            filePath: 'test.js',
            output: undefined, // No fixes available
            errorCount: 1,
            warningCount: 0,
            fixableErrorCount: 0,
            fixableWarningCount: 0,
            fatalErrorCount: 0,
            messages: [],
          },
        ]);
        
        const error = createTestError(ErrorType.ESLINT, 'Missing semicolon', 'test.js');
        const result = await autoFixer.applyFix(error);
        
        expect(result.success).toBe(false);
        expect(result.error).toContain('No auto-fixes available');
      });

      test('should handle ESLint errors during fix', async () => {
        mockESLint.prototype.lintFiles = jest.fn().mockRejectedValue(new Error('ESLint error'));
        
        const error = createTestError(ErrorType.ESLINT, 'Missing semicolon', 'test.js');
        const result = await autoFixer.applyFix(error);
        
        expect(result.success).toBe(false);
        expect(result.error).toContain('ESLint error');
      });
    });

    describe('TypeScript Fixes', () => {
      test('should detect and fix TypeScript import errors', async () => {
        mockFs.readFile = jest.fn().mockResolvedValue(
          'function test() {\n  console.log("test");\n}'
        );
        
        const error = createTestError(
          ErrorType.TYPESCRIPT, 
          'Cannot find name "React"', 
          'test.tsx'
        );
        
        const result = await autoFixer.applyFix(error);
        
        expect(result.success).toBe(true);
        expect(result.changes?.type).toBe('add_import');
      });

      test('should detect and fix TypeScript type annotation errors', async () => {
        mockFs.readFile = jest.fn().mockResolvedValue(
          'function test(data) {\n  return data;\n}'
        );
        
        const error = createTestError(
          ErrorType.TYPESCRIPT,
          'Parameter \'data\' implicitly has an \'any\' type',
          'test.ts'
        );
        
        const result = await autoFixer.applyFix(error);
        
        expect(result.success).toBe(true);
        expect(result.changes?.type).toBe('add_parameter_type');
      });

      test('should detect and fix missing return types', async () => {
        mockFs.readFile = jest.fn().mockResolvedValue(
          'function test() {\n  return "hello";\n}'
        );
        
        const error = createTestError(
          ErrorType.TYPESCRIPT,
          'Function implicitly has an \'any\' return type',
          'test.ts'
        );
        
        const result = await autoFixer.applyFix(error);
        
        expect(result.success).toBe(true);
        expect(result.changes?.type).toBe('add_return_type');
      });

      test('should detect and fix property access errors', async () => {
        mockFs.readFile = jest.fn().mockResolvedValue(
          'const result = user.name;\n'
        );
        
        const error = createTestError(
          ErrorType.TYPESCRIPT,
          'Property \'name\' does not exist on type \'User\'',
          'test.ts'
        );
        
        const result = await autoFixer.applyFix(error);
        
        expect(result.success).toBe(true);
        expect(result.changes?.type).toBe('add_optional_chaining');
      });

      test('should detect and fix null/undefined access errors', async () => {
        mockFs.readFile = jest.fn().mockResolvedValue(
          'const length = data.length;\n'
        );
        
        const error = createTestError(
          ErrorType.TYPESCRIPT,
          'Object is possibly \'null\'',
          'test.ts'
        );
        
        const result = await autoFixer.applyFix(error);
        
        expect(result.success).toBe(true);
        expect(result.changes?.type).toBe('add_optional_chaining');
      });

      test('should detect and remove unused variables', async () => {
        mockFs.readFile = jest.fn().mockResolvedValue(
          'const unusedVar = "hello";\n'
        );
        
        const error = createTestError(
          ErrorType.TYPESCRIPT,
          '\'unusedVar\' is declared but never used',
          'test.ts'
        );
        
        const result = await autoFixer.applyFix(error);
        
        expect(result.success).toBe(true);
        expect(result.changes?.type).toBe('remove_unused_variable');
      });

      test('should handle unknown TypeScript error patterns', async () => {
        const error = createTestError(
          ErrorType.TYPESCRIPT,
          'Complex unknown TypeScript error',
          'test.ts'
        );
        
        const result = await autoFixer.applyFix(error);
        
        expect(result.success).toBe(false);
        expect(result.error).toContain('No automatic fix available');
      });
    });

    describe('Import Fixes', () => {
      test('should detect and suggest fixes for missing packages', async () => {
        const error = createTestError(
          ErrorType.IMPORT,
          'Module not found: Can\'t resolve \'lodash\'',
          'test.js'
        );
        
        const result = await autoFixer.applyFix(error);
        
        expect(result.success).toBe(false);
        expect(result.error).toContain('requires user confirmation');
      });

      test('should fix import file extensions', async () => {
        mockFs.readFile = jest.fn().mockResolvedValue(
          'import { helper } from "./utils";\n'
        );
        
        const error = createTestError(
          ErrorType.IMPORT,
          'Incorrect file extension .js should be .ts',
          'test.js'
        );
        
        const result = await autoFixer.applyFix(error);
        
        expect(result.success).toBe(true);
        expect(result.changes?.type).toBe('fix_import_extension');
      });

      test('should handle unknown import error patterns', async () => {
        const error = createTestError(
          ErrorType.IMPORT,
          'Complex unknown import error',
          'test.js'
        );
        
        const result = await autoFixer.applyFix(error);
        
        expect(result.success).toBe(false);
        expect(result.error).toContain('No automatic fix available');
      });
    });

    describe('Build Fixes', () => {
      test('should detect Next.js config issues but require manual intervention', async () => {
        const error = createTestError(
          ErrorType.BUILD,
          'Error in next.config.js',
          'next.config.js'
        );
        
        const result = await autoFixer.applyFix(error);
        
        expect(result.success).toBe(false);
        expect(result.error).toContain('manual intervention');
      });

      test('should detect package.json issues but require manual intervention', async () => {
        const error = createTestError(
          ErrorType.BUILD,
          'Error in package.json',
          'package.json'
        );
        
        const result = await autoFixer.applyFix(error);
        
        expect(result.success).toBe(false);
        expect(result.error).toContain('manual intervention');
      });

      test('should handle unknown build error patterns', async () => {
        const error = createTestError(
          ErrorType.BUILD,
          'Generic build error',
          'src/index.js'
        );
        
        const result = await autoFixer.applyFix(error);
        
        expect(result.success).toBe(false);
        expect(result.error).toContain('No automatic fix available');
      });
    });
  });

  describe('Custom NextJS-Specific Fixes', () => {
    test('should detect and fix App Router issues', async () => {
      const error = createTestError(
        ErrorType.UNKNOWN,
        'useRouter is not defined',
        'app/page.tsx'
      );
      
      mockFs.readFile = jest.fn().mockResolvedValue(
        'export default function Page() {\n  const router = useRouter();\n}'
      );
      
      const result = await autoFixer.applyFix(error);
      
      expect(result.success).toBe(true);
      expect(result.changes?.type).toBe('add_use_client_directive');
    });

    test('should detect and fix client component issues', async () => {
      const error = createTestError(
        ErrorType.UNKNOWN,
        'useState is not defined',
        'components/Counter.tsx'
      );
      
      mockFs.readFile = jest.fn().mockResolvedValue(
        'export default function Counter() {\n  const [count, setCount] = useState(0);\n}'
      );
      
      const result = await autoFixer.applyFix(error);
      
      expect(result.success).toBe(true);
      expect(result.changes?.type).toBe('add_use_client_directive');
    });

    test('should detect and fix API route issues', async () => {
      const error = createTestError(
        ErrorType.UNKNOWN,
        'Missing return Response',
        'app/api/users/route.ts'
      );
      
      mockFs.readFile = jest.fn().mockResolvedValue(
        'export async function GET() {\n  // missing response\n}'
      );
      
      const result = await autoFixer.applyFix(error);
      
      expect(result.success).toBe(true);
      expect(result.changes?.type).toBe('add_api_response');
    });

    test('should detect and fix missing alt attributes', async () => {
      const error = createTestError(
        ErrorType.UNKNOWN,
        'img elements must have an alt prop',
        'components/Gallery.tsx'
      );
      
      mockFs.readFile = jest.fn().mockResolvedValue(
        '<img src="/image.jpg" />'
      );
      
      const result = await autoFixer.applyFix(error);
      
      expect(result.success).toBe(true);
      expect(result.changes?.type).toBe('add_alt_attribute');
    });

    test('should detect and fix missing key props', async () => {
      const error = createTestError(
        ErrorType.UNKNOWN,
        'Missing \'key\' prop for element in iterator',
        'components/List.tsx'
      );
      
      mockFs.readFile = jest.fn().mockResolvedValue(
        'items.map((item) => <div>{item.name}</div>)'
      );
      
      const result = await autoFixer.applyFix(error);
      
      expect(result.success).toBe(true);
      expect(result.changes?.type).toBe('add_key_prop');
    });

    test('should detect and remove console statements', async () => {
      const error = createTestError(
        ErrorType.UNKNOWN,
        'Unexpected console statement',
        'utils/debug.js'
      );
      
      mockFs.readFile = jest.fn().mockResolvedValue(
        'function debug() {\n  console.log("debug");\n  return true;\n}'
      );
      
      const result = await autoFixer.applyFix(error);
      
      expect(result.success).toBe(true);
      expect(result.changes?.type).toBe('remove_console_statement');
    });
  });

  describe('Backup System', () => {
    test('should create backup with metadata', async () => {
      const backupId = await autoFixer['createEnhancedBackup'](
        '/test/file.js',
        'eslint',
        'Test backup'
      );
      
      expect(backupId).toBe('test-uuid-123');
      expect(mockFs.copyFile).toHaveBeenCalled();
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('metadata.json'),
        expect.any(String),
        'utf8'
      );
    });

    test('should restore backup successfully', async () => {
      // Setup backup metadata
      autoFixer['backupMetadata'].set('backup-1', {
        id: 'backup-1',
        filePath: '/test/file.js',
        timestamp: new Date(),
        originalSize: 500,
        checksum: 'test-checksum-456',
        fixType: 'eslint',
        description: 'Test backup',
      });
      
      mockFs.readdir = jest.fn().mockResolvedValue(['file.js.backup.backup-1']);
      mockFs.readFile = jest.fn().mockResolvedValue('backup content');
      
      await autoFixer['restoreEnhancedBackup']('backup-1');
      
      expect(mockFs.copyFile).toHaveBeenCalledWith(
        expect.stringContaining('backup-1'),
        '/test/file.js'
      );
    });

    test('should validate backup integrity', async () => {
      autoFixer['backupMetadata'].set('backup-1', {
        id: 'backup-1',
        filePath: '/test/file.js',
        timestamp: new Date(),
        originalSize: 500,
        checksum: 'test-checksum-456',
        fixType: 'eslint',
        description: 'Test backup',
      });
      
      mockFs.readdir = jest.fn().mockResolvedValue(['file.js.backup.backup-1']);
      mockFs.readFile = jest.fn().mockResolvedValue('backup content');
      
      const isValid = await autoFixer.validateBackup('backup-1');
      
      expect(isValid).toBe(true);
    });

    test('should list backups for specific file', async () => {
      autoFixer['backupMetadata'].set('backup-1', {
        id: 'backup-1',
        filePath: '/test/file.js',
        timestamp: new Date(),
        originalSize: 500,
        checksum: 'abc123',
        fixType: 'eslint',
        description: 'Test backup 1',
      });
      
      autoFixer['backupMetadata'].set('backup-2', {
        id: 'backup-2',
        filePath: '/test/other.js',
        timestamp: new Date(),
        originalSize: 300,
        checksum: 'def456',
        fixType: 'typescript',
        description: 'Test backup 2',
      });
      
      const backups = await autoFixer.listBackups('/test/file.js');
      
      expect(backups).toHaveLength(1);
      expect(backups[0]?.filePath).toBe('/test/file.js');
    });

    test('should cleanup old backups based on retention policy', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10); // 10 days old
      
      autoFixer['backupMetadata'].set('old-backup', {
        id: 'old-backup',
        filePath: '/test/file.js',
        timestamp: oldDate,
        originalSize: 500,
        checksum: 'abc123',
        fixType: 'eslint',
        description: 'Old backup',
      });
      
      mockFs.readdir = jest.fn().mockResolvedValue(['file.js.backup.old-backup']);
      
      await autoFixer.cleanupOldBackups();
      
      expect(mockFs.unlink).toHaveBeenCalled();
      expect(autoFixer['backupMetadata'].has('old-backup')).toBe(false);
    });

    test('should handle backup errors gracefully', async () => {
      mockFs.copyFile = jest.fn().mockRejectedValue(new Error('Backup failed'));
      
      await expect(
        autoFixer['createEnhancedBackup']('/test/file.js', 'eslint', 'Test')
      ).rejects.toThrow('Backup failed');
    });
  });

  describe('Safety Mechanisms', () => {
    test('should block complex fixes in safe mode', () => {
      mockConfig.safeMode = true;
      autoFixer = new AutoFixer(mockConfig);
      
      const error = createTestError(
        ErrorType.BUILD,
        'Complex configuration error',
        'next.config.js'
      );
      
      const canFix = autoFixer['canFixInSafeMode'](error);
      expect(canFix).toBe(false);
    });

    test('should allow simple fixes in safe mode', () => {
      mockConfig.safeMode = true;
      autoFixer = new AutoFixer(mockConfig);
      
      const error = createTestError(
        ErrorType.ESLINT,
        'Missing semicolon',
        'test.js'
      );
      
      const canFix = autoFixer['canFixInSafeMode'](error);
      expect(canFix).toBe(true);
    });

    test('should assess fix risk levels correctly', () => {
      const lowRiskError = createTestError(ErrorType.ESLINT, 'Missing semicolon');
      const mediumRiskError = createTestError(ErrorType.TYPESCRIPT, 'Type assertion needed');
      const highRiskError = createTestError(ErrorType.BUILD, 'Install dependency');
      
      const lowRisk = autoFixer['assessFixRisk'](lowRiskError, { type: 'remove_console_statement', description: 'Remove console' });
      const mediumRisk = autoFixer['assessFixRisk'](mediumRiskError, { type: 'add_type_assertion', description: 'Add assertion' });
      const highRisk = autoFixer['assessFixRisk'](highRiskError, { type: 'install_dependency', description: 'Install package' });
      
      expect(lowRisk).toBe('low');
      expect(mediumRisk).toBe('medium');
      expect(highRisk).toBe('high');
    });

    test('should generate fix preview with safety analysis', async () => {
      const error = createTestError(ErrorType.ESLINT, 'Missing semicolon', 'test.js');
      
      const preview = await autoFixer['generateFixPreview'](error);
      
      expect(preview.canProceed).toBe(true);
      expect(preview.preview).toContain('test.js');
    });

    test('should block fixes for large files in safe mode', async () => {
      mockFs.stat = jest.fn().mockResolvedValue({
        isFile: () => true,
        size: 100 * 1024, // 100KB (larger than 50KB limit)
      } as any);
      
      const error = createTestError(ErrorType.ESLINT, 'Missing semicolon', 'large-file.js');
      
      const preview = await autoFixer['generateFixPreview'](error);
      
      expect(preview.canProceed).toBe(false);
      expect(preview.reason).toContain('File too large');
    });

    test('should validate syntax after fixes', async () => {
      mockFs.readFile = jest.fn().mockResolvedValue('valid javascript code');
      
      const validation = await autoFixer['validateSyntax']('test.js');
      
      expect(validation.isValid).toBe(true);
    });

    test('should validate TypeScript compilation', async () => {
      mockFs.readFile = jest.fn().mockResolvedValue('const x: string = "hello";');
      
      const validation = await autoFixer['validateTypeScript']('test.ts');
      
      expect(validation.isValid).toBe(true);
    });

    test('should detect TypeScript syntax issues', async () => {
      mockFs.readFile = jest.fn().mockResolvedValue('const x: : string = "hello";'); // Double colon
      
      const validation = await autoFixer['validateTypeScript']('test.ts');
      
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('Double colon');
    });

    test('should validate with ESLint when available', async () => {
      const validation = await autoFixer['validateESLint']('test.js');
      
      expect(validation.isValid).toBe(true);
      expect(mockESLint.prototype.lintFiles).toHaveBeenCalledWith(['test.js']);
    });

    test('should detect ESLint fatal errors', async () => {
      mockESLint.prototype.lintFiles = jest.fn().mockResolvedValue([
        {
          filePath: 'test.js',
          fatalErrorCount: 1,
          messages: [{ fatal: true, message: 'Syntax error', severity: 2 }],
        },
      ]);
      
      const validation = await autoFixer['validateESLint']('test.js');
      
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('Syntax error');
    });
  });

  describe('Force Apply and Safe Mode Alternatives', () => {
    test('should force apply fix by temporarily disabling safe mode', async () => {
      mockConfig.safeMode = true;
      autoFixer = new AutoFixer(mockConfig);
      
      const error = createTestError(ErrorType.ESLINT, 'Missing semicolon', 'test.js');
      
      const result = await autoFixer.forceApplyFix(error);
      
      expect(result.success).toBe(true);
      // Should restore safe mode setting
      expect(mockConfig.safeMode).toBe(true);
    });

    test('should provide safe mode alternatives for blocked fixes', () => {
      const error = createTestError(ErrorType.BUILD, 'Complex error', 'config.js');
      
      const alternatives = autoFixer.getSafeModeAlternatives(error);
      
      expect(alternatives).toContain('Use forceApplyFix() to override safe mode restrictions');
      expect(alternatives.length).toBeGreaterThan(1);
    });

    test('should provide fix suggestions for non-fixable errors', () => {
      const error = createTestError(ErrorType.TYPESCRIPT, 'Complex type error', 'test.ts');
      
      const suggestions = autoFixer.getFixSuggestions(error);
      
      expect(suggestions).toContain('Check TypeScript documentation for this error code');
      expect(suggestions.length).toBeGreaterThan(1);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle file read errors gracefully', async () => {
      mockFs.readFile = jest.fn().mockRejectedValue(new Error('Permission denied'));
      
      const error = createTestError(ErrorType.TYPESCRIPT, 'Type error', 'test.ts');
      const result = await autoFixer.applyFix(error);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });

    test('should handle file write errors gracefully', async () => {
      mockFs.writeFile = jest.fn().mockRejectedValue(new Error('Disk full'));
      
      const error = createTestError(ErrorType.ESLINT, 'Missing semicolon', 'test.js');
      const result = await autoFixer.applyFix(error);
      
      expect(result.success).toBe(false);
    });

    test('should handle malformed file content', async () => {
      mockFs.readFile = jest.fn().mockResolvedValue(''); // Empty file
      
      const error = createTestError(ErrorType.TYPESCRIPT, 'Type error', 'test.ts');
      const result = await autoFixer.applyFix(error);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Could not find error line');
    });

    test('should handle unknown fix strategy types', async () => {
      const error = createTestError(ErrorType.UNKNOWN, 'Unknown error', 'test.js');
      
      const result = await autoFixer.applyFix(error);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('No automatic fix available');
    });

    test('should handle backup restoration failures', async () => {
      autoFixer['backupMetadata'].set('backup-1', {
        id: 'backup-1',
        filePath: '/test/file.js',
        timestamp: new Date(),
        originalSize: 500,
        checksum: 'abc123',
        fixType: 'eslint',
        description: 'Test backup',
      });
      
      mockFs.readdir = jest.fn().mockResolvedValue([]); // No backup files found
      
      await expect(
        autoFixer['restoreEnhancedBackup']('backup-1')
      ).rejects.toThrow('Backup file for backup-1 not found');
    });

    test('should handle corrupted backup metadata', async () => {
      mockFs.access = jest.fn().mockResolvedValue(undefined);
      mockFs.readFile = jest.fn().mockResolvedValue('invalid json');
      
      // Should not throw, just log warning
      const newFixer = new AutoFixer(mockConfig);
      expect(newFixer).toBeInstanceOf(AutoFixer);
    });

    test('should handle missing backup metadata', async () => {
      const isValid = await autoFixer.validateBackup('non-existent-backup');
      expect(isValid).toBe(false);
    });
  });

  describe('Utility Methods', () => {
    test('should generate unique backup IDs', () => {
      const id1 = autoFixer['generateBackupId']();
      const id2 = autoFixer['generateBackupId']();
      
      expect(id1).toBe('test-uuid-123');
      expect(id2).toBe('test-uuid-123'); // Mocked to return same value
    });

    test('should calculate checksums correctly', () => {
      const checksum = autoFixer['calculateChecksum']('test content');
      expect(checksum).toBe('test-checksum-456'); // Mocked value
    });

    test('should infer parameter types correctly', () => {
      expect(autoFixer['inferParameterType']('id', 'function(id)')).toBe('string');
      expect(autoFixer['inferParameterType']('count', 'function(count)')).toBe('number');
      expect(autoFixer['inferParameterType']('callback', 'function(callback)')).toBe('Function');
      expect(autoFixer['inferParameterType']('event', 'function(event)')).toBe('Event');
      expect(autoFixer['inferParameterType']('unknown', 'function(unknown)')).toBe('any');
    });

    test('should find function end correctly', () => {
      const lines = [
        'function test() {',
        '  const x = 1;',
        '  return x;',
        '}',
        'const y = 2;',
      ];
      
      const end = autoFixer['findFunctionEnd'](lines, 0);
      expect(end).toBe(3);
    });

    test('should detect existing responses in functions', () => {
      const lines = [
        'function test() {',
        '  return response;',
        '}',
      ];
      
      const hasResponse = autoFixer['hasPropResponse'](lines, 0, 2);
      expect(hasResponse).toBe(true);
    });
  });

  describe('Integration Tests', () => {
    test('should complete full fix workflow with backup and validation', async () => {
      mockConfig.backupEnabled = true;
      mockConfig.validateFixes = true;
      autoFixer = new AutoFixer(mockConfig);
      
      const error = createTestError(ErrorType.ESLINT, 'Missing semicolon', 'test.js');
      
      const result = await autoFixer.applyFix(error);
      
      expect(result.success).toBe(true);
      expect(result.applied).toBe(true);
      
      // Verify backup was created
      expect(mockFs.copyFile).toHaveBeenCalled();
      
      // Verify fix was applied
      expect(mockFs.writeFile).toHaveBeenCalledWith('test.js', 'fixed content', 'utf8');
      
      // Verify validation was performed
      expect(mockFs.stat).toHaveBeenCalled();
    });

    test('should handle complex TypeScript fix with multiple steps', async () => {
      mockFs.readFile = jest.fn()
        .mockResolvedValueOnce('function test(data) { return data.name; }')
        .mockResolvedValueOnce('function test(data: any): any { return data?.name; }');
      
      const error1 = createTestError(
        ErrorType.TYPESCRIPT,
        'Parameter \'data\' implicitly has an \'any\' type',
        'test.ts'
      );
      
      const error2 = createTestError(
        ErrorType.TYPESCRIPT,
        'Object is possibly \'null\'',
        'test.ts'
      );
      
      const result1 = await autoFixer.applyFix(error1);
      const result2 = await autoFixer.applyFix(error2);
      
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });
  });
});