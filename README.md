# NextJS MCP Development Monitor

MCP server that monitors NextJS development server logs and automatically fixes errors.

## Features

- 🔍 **Real-time Monitoring**: Watches NextJS development server output
- 🔧 **Auto-Fix Capabilities**: Automatically resolves common errors
- 🛡️ **Safe Mode**: Optional confirmation before applying fixes
- 📋 **Error Classification**: Intelligent categorization and prioritization
- 💾 **Backup System**: Automatic file backups before fixes
- 🎯 **MCP Integration**: Seamless integration with Claude Code

## Installation

```bash
npm install nextjs-mcp-dev-monitor
```

## Usage

### As MCP Server

Add to your Claude Code MCP configuration:

```json
{
  "mcpServers": {
    "nextjs-monitor": {
      "command": "npx",
      "args": ["nextjs-mcp-dev-monitor"]
    }
  }
}
```

### Available MCP Tools

- `start_monitoring` - Begin monitoring a NextJS project
- `get_current_errors` - Retrieve detected errors
- `apply_error_fix` - Apply automatic fixes
- `get_monitoring_status` - Check monitor status
- `stop_monitoring` - Stop the monitoring process

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode
npm run dev

# Run tests
npm test

# Lint code
npm run lint
```

## Configuration

Default configuration can be overridden when starting monitoring:

```typescript
{
  autoFix: true,
  safeMode: true,
  backupEnabled: true,
  logLevel: 'info',
  excludePatterns: ['node_modules/**', 'dist/**', '.next/**'],
  includePatterns: ['src/**/*.ts', 'src/**/*.tsx']
}
```

## License

MIT