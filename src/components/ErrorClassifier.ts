/**
 * ErrorClassifier component - classifies and prioritizes errors
 * TODO: Implement in Task 3.2.3
 */

import { ParsedError, ClassifiedError } from '@/types/errors.js';

export interface IErrorClassifier {
  classifyError(error: ParsedError): ClassifiedError;
  classifyErrors(errors: ParsedError[]): ClassifiedError[];
}

export class ErrorClassifier implements IErrorClassifier {
  classifyError(error: ParsedError): ClassifiedError {
    throw new Error('ErrorClassifier.classifyError() not yet implemented');
  }

  classifyErrors(errors: ParsedError[]): ClassifiedError[] {
    throw new Error('ErrorClassifier.classifyErrors() not yet implemented');
  }
}