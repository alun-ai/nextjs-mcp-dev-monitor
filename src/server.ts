#!/usr/bin/env node

/**
 * NextJS MCP Development Monitor Server
 * 
 * MCP server that monitors NextJS development server logs and automatically fixes errors.
 * 
 * @version 1.0.0-alpha.1
 * @author NextJS MCP Dev Monitor Team
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Import MCP tool implementations
import { startMonitoring, stopMonitoring } from './tools/monitoring.js';
import { getCurrentErrors, applyFix } from './tools/errors.js';
import { getMonitoringStatus } from './tools/status.js';

class NextJSMCPMonitorServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'nextjs-mcp-dev-monitor',
        version: '1.0.0-alpha.1',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupToolHandlers();
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'start_monitoring',
            description: 'Start monitoring NextJS development server',
            inputSchema: {
              type: 'object',
              properties: {
                projectPath: {
                  type: 'string',
                  description: 'Path to the NextJS project directory',
                },
                config: {
                  type: 'object',
                  description: 'Optional monitoring configuration',
                  properties: {
                    autoFix: {
                      type: 'boolean',
                      description: 'Enable automatic error fixes',
                      default: true,
                    },
                    safeMode: {
                      type: 'boolean',
                      description: 'Enable safe mode for fixes',
                      default: true,
                    },
                    backupEnabled: {
                      type: 'boolean',
                      description: 'Enable file backups before fixes',
                      default: true,
                    },
                    logLevel: {
                      type: 'string',
                      enum: ['debug', 'info', 'warn', 'error'],
                      description: 'Logging level',
                      default: 'info',
                    },
                  },
                },
              },
              required: ['projectPath'],
            },
          },
          {
            name: 'stop_monitoring',
            description: 'Stop monitoring NextJS development server',
            inputSchema: {
              type: 'object',
              properties: {
                force: {
                  type: 'boolean',
                  description: 'Force stop even if process is busy',
                  default: false,
                },
              },
            },
          },
          {
            name: 'get_current_errors',
            description: 'Get current errors detected by the monitor',
            inputSchema: {
              type: 'object',
              properties: {
                filter: {
                  type: 'object',
                  description: 'Filter criteria for errors',
                  properties: {
                    type: {
                      type: 'array',
                      items: {
                        type: 'string',
                        enum: ['typescript', 'eslint', 'build', 'runtime', 'import', 'syntax', 'unknown'],
                      },
                      description: 'Filter by error types',
                    },
                    severity: {
                      type: 'array',
                      items: {
                        type: 'string',
                        enum: ['error', 'warning', 'info'],
                      },
                      description: 'Filter by error severity',
                    },
                    fixable: {
                      type: 'boolean',
                      description: 'Filter by auto-fixable status',
                    },
                  },
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of errors to return',
                  default: 50,
                  minimum: 1,
                  maximum: 100,
                },
                offset: {
                  type: 'number',
                  description: 'Offset for pagination',
                  default: 0,
                  minimum: 0,
                },
              },
            },
          },
          {
            name: 'get_monitoring_status',
            description: 'Get current monitoring status and metrics',
            inputSchema: {
              type: 'object',
              properties: {
                includeMetrics: {
                  type: 'boolean',
                  description: 'Include detailed metrics in response',
                  default: true,
                },
              },
            },
          },
          {
            name: 'apply_fix',
            description: 'Apply automatic fix for a specific error',
            inputSchema: {
              type: 'object',
              properties: {
                errorId: {
                  type: 'string',
                  description: 'ID of the error to fix',
                },
                confirmFix: {
                  type: 'boolean',
                  description: 'Whether to confirm before applying the fix',
                  default: false,
                },
                createBackup: {
                  type: 'boolean',
                  description: 'Whether to create a backup before applying the fix',
                  default: true,
                },
              },
              required: ['errorId'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        switch (name) {
          case 'start_monitoring': {
            const result = await startMonitoring(args || {});
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'stop_monitoring': {
            const result = await stopMonitoring(args || {});
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'get_current_errors': {
            const result = await getCurrentErrors(args || {});
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'get_monitoring_status': {
            const result = await getMonitoringStatus(args || {});
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'apply_fix': {
            const result = await applyFix(args as any || {});
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: error instanceof Error ? error.message : 'Unknown error',
                tool: name,
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    });
  }

  public async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('NextJS MCP Monitor Server started');
  }
}

if (require.main === module) {
  const server = new NextJSMCPMonitorServer();
  server.start().catch((error: unknown) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

export { NextJSMCPMonitorServer };