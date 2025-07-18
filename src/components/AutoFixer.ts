/**
 * AutoFixer component - applies automatic fixes to errors
 * TODO: Implement in Task 3.4
 */

import { ClassifiedError, FixResult } from '@/types/errors.js';

export interface IAutoFixer {
  canFix(error: ClassifiedError): boolean;
  applyFix(error: ClassifiedError): Promise<FixResult>;
}

export class AutoFixer implements IAutoFixer {
  canFix(error: ClassifiedError): boolean {
    throw new Error('AutoFixer.canFix() not yet implemented');
  }

  async applyFix(error: ClassifiedError): Promise<FixResult> {
    throw new Error('AutoFixer.applyFix() not yet implemented');
  }
}