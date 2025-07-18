/**
 * MCP monitoring tools
 * TODO: Implement in Task 3.3.1
 */

import { 
  StartMonitoringInput, 
  StartMonitoringOutput,
  StopMonitoringInput,
  StopMonitoringOutput
} from '@/types/mcp.js';

export async function startMonitoring(input: StartMonitoringInput): Promise<StartMonitoringOutput> {
  throw new Error('startMonitoring() not yet implemented');
}

export async function stopMonitoring(input: StopMonitoringInput): Promise<StopMonitoringOutput> {
  throw new Error('stopMonitoring() not yet implemented');
}