# NextJS MCP Development Monitor

MCP server that monitors NextJS development server logs and automatically fixes errors.

## Features

- 🔍 **Real-time Monitoring**: Watches NextJS development server output
- 🔧 **Auto-Fix Capabilities**: Automatically resolves common errors
- 🛡️ **Safe Mode**: Optional confirmation before applying fixes
- 📋 **Error Classification**: Intelligent categorization and prioritization
- 💾 **Backup System**: Automatic file backups before fixes
- 🎯 **MCP Integration**: Seamless integration with Claude Code
- 🌐 **Frontend Error Detection**: Puppeteer integration for browser console errors
- 🔄 **Full-Stack Coverage**: Monitors both server-side and client-side errors

## Extended Features

### Puppeteer Integration for Frontend Errors

The monitor includes advanced Puppeteer integration to capture and analyze frontend console errors:

- **Browser Console Monitoring**: Automatically detects JavaScript errors, warnings, and network failures
- **Runtime Error Analysis**: Captures React component errors, hydration mismatches, and state management issues
- **Performance Monitoring**: Identifies slow-loading resources and performance bottlenecks
- **Visual Regression Detection**: Monitors for layout shifts and rendering issues
- **Cross-Browser Testing**: Validates fixes across different browser environments

#### Frontend Error Types Supported:

- **JavaScript Runtime Errors**: Uncaught exceptions, reference errors, type errors
- **React-Specific Issues**: Component lifecycle errors, hook violations, prop validation
- **Network Failures**: Failed API calls, resource loading errors, CORS issues
- **Performance Issues**: Memory leaks, excessive re-renders, bundle size warnings
- **Accessibility Violations**: ARIA issues, keyboard navigation problems, contrast errors

#### Automated Frontend Fixes:

- **Import Resolution**: Fixes missing imports and incorrect module paths
- **Component Debugging**: Resolves common React patterns and anti-patterns
- **API Integration**: Corrects fetch calls, error handling, and data validation
- **Styling Issues**: Fixes CSS-in-JS problems, responsive design issues
- **Bundle Optimization**: Suggests code splitting and lazy loading improvements

## Installation

For now, install directly from the GitHub repository:

```bash
npm install git+https://github.com/alun-ai/mcp-nextjs-dev-server#main:nextjs-mcp-dev-monitor
```

> Note: This package will be available as `npx nextjs-mcp-dev-monitor` once published to npm.

## Usage

### As MCP Server

Add to your Claude Code MCP configuration:

```json
{
  "mcpServers": {
    "nextjs-monitor": {
      "command": "node",
      "args": ["./node_modules/nextjs-mcp-dev-monitor/dist/server.js"]
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