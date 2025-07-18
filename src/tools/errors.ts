/**
 * MCP error reporting tools
 * Provides error retrieval and filtering functionality
 */

import { GetErrorsInput, GetErrorsOutput, ApplyFixInput, ApplyFixOutput } from '../types/mcp.js';
import { getMonitorService } from './monitoring.js';

export async function getCurrentErrors(input: GetErrorsInput): Promise<GetErrorsOutput> {
  const monitorService = getMonitorService();
  
  if (!monitorService) {
    return {
      errors: [],
      total: 0,
      hasMore: false,
    };
  }

  // Get filtered errors based on input criteria
  const filteredErrors = input.filter 
    ? monitorService.getFilteredErrors(input.filter)
    : monitorService.getCurrentErrors();

  const total = filteredErrors.length;
  const offset = input.offset || 0;
  const limit = input.limit || 50;

  // Apply pagination
  const paginatedErrors = filteredErrors.slice(offset, offset + limit);
  const hasMore = offset + limit < total;

  return {
    errors: paginatedErrors,
    total,
    hasMore,
  };
}

export async function applyFix(input: ApplyFixInput): Promise<ApplyFixOutput> {
  const monitorService = getMonitorService();
  
  if (!monitorService) {
    return {
      success: false,
      file: '',
      applied: false,
      error: 'Monitor service not available',
    };
  }

  try {
    // Find the error by ID
    const errors = monitorService.getCurrentErrors();
    const error = errors.find(e => e.id === input.errorId);
    
    if (!error) {
      return {
        success: false,
        file: '',
        applied: false,
        error: `Error with ID ${input.errorId} not found`,
      };
    }

    // Check if auto-fix is available for this error
    if (!error.autoFixable) {
      return {
        success: false,
        file: error.file,
        applied: false,
        error: 'This error is not auto-fixable',
        recommendation: 'Manual intervention required',
      };
    }

    // Apply the fix using the monitor service's auto-fixer
    const fixResult = await monitorService.applyAutoFix(error);
    
    return {
      ...fixResult,
      recommendation: fixResult.success 
        ? 'Fix applied successfully'
        : 'Fix failed - check error details',
    };

  } catch (fixError) {
    return {
      success: false,
      file: '',
      applied: false,
      error: fixError instanceof Error ? fixError.message : 'Unknown error occurred',
    };
  }
}