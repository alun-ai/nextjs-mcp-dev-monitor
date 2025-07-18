/**
 * MCP monitoring tools
 * Provides start/stop monitoring functionality via MCP interface
 */

import { 
  StartMonitoringInput, 
  StartMonitoringOutput,
  StopMonitoringInput,
  StopMonitoringOutput
} from '../types/mcp.js';
import { MonitorService } from '../components/MonitorService.js';

// Global monitor service instance
let monitorService: MonitorService | null = null;

export async function startMonitoring(input: StartMonitoringInput): Promise<StartMonitoringOutput> {
  try {
    // Validate required input
    if (!input.projectPath) {
      return {
        status: 'failed',
        message: 'Project path is required to start monitoring',
      };
    }

    // If already running, return appropriate status
    if (monitorService && monitorService.isRunning()) {
      return {
        status: 'already_running',
        message: 'Monitoring is already active for the current project',
      };
    }

    // Create or reuse monitor service
    if (!monitorService) {
      monitorService = new MonitorService();
    }

    // Start monitoring with provided configuration
    await monitorService.start(input.projectPath, input.config);

    const metrics = monitorService.getMetrics();

    return {
      status: 'started',
      processId: metrics.processId || undefined,
      monitoringUrl: `http://localhost:3000`, // Default Next.js dev URL
      message: `Successfully started monitoring NextJS development server at ${input.projectPath}`,
    };

  } catch (error) {
    console.error('Failed to start monitoring:', error);
    
    return {
      status: 'failed',
      message: error instanceof Error 
        ? `Failed to start monitoring: ${error.message}`
        : 'Failed to start monitoring due to unknown error',
    };
  }
}

export async function stopMonitoring(input: StopMonitoringInput): Promise<StopMonitoringOutput> {
  try {
    if (!monitorService || !monitorService.isRunning()) {
      return {
        status: 'not_running',
        message: 'Monitoring is not currently active',
      };
    }

    await monitorService.stop();

    return {
      status: 'stopped',
      message: 'Successfully stopped NextJS development server monitoring',
    };

  } catch (error) {
    console.error('Failed to stop monitoring:', error);
    
    return {
      status: 'failed',
      message: error instanceof Error 
        ? `Failed to stop monitoring: ${error.message}`
        : 'Failed to stop monitoring due to unknown error',
    };
  }
}

export function getMonitorService(): MonitorService | null {
  return monitorService;
}