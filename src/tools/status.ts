/**
 * MCP status and control tools
 * Provides monitoring status and health information
 */

import { MonitorStatusInput, MonitorStatusOutput } from '../types/mcp.js';
import { getMonitorService } from './monitoring.js';

export async function getMonitoringStatus(input: MonitorStatusInput): Promise<MonitorStatusOutput> {
  const monitorService = getMonitorService();
  
  if (!monitorService) {
    return {
      isRunning: false,
    };
  }

  const isRunning = monitorService.isRunning();
  
  if (!isRunning) {
    return {
      isRunning: false,
    };
  }

  const result: MonitorStatusOutput = {
    isRunning: true,
    projectPath: monitorService['config']?.projectPath,
  };

  // Include metrics if requested
  if (input.includeMetrics) {
    const metrics = monitorService.getMetrics();
    result.processId = metrics.processId || undefined;
    result.uptime = metrics.uptime;
    result.metrics = {
      errorsDetected: metrics.errorsDetected,
      fixesApplied: metrics.fixesApplied,
      successRate: metrics.successRate,
    };
  }

  return result;
}