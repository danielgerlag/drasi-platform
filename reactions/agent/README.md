# Drasi AI Agent Reaction

An intelligent data change processor built with LangChain and Azure OpenAI that can dynamically respond to change events using MCP (Model Context Protocol) servers as plugins.

## Features

- 🤖 **AI-Powered Analysis**: Uses Azure OpenAI to intelligently analyze and respond to data changes
- 🔌 **Dynamic Plugin System**: MCP servers provide extensible tools and capabilities
- 💭 **Conversation Memory**: Maintains context and history across change events
- 🛡️ **Fallback Mode**: Gracefully degrades to basic logging if AI components fail
- ⚙️ **Environment Configuration**: Flexible configuration via environment variables
- 🧪 **Test Harness**: Built-in testing framework with sample data

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Drasi SDK     │───▶│  Change Handler │───▶│   AI Agent      │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                       │
                                                       ▼
                                               ┌─────────────────┐
                                               │  LangChain      │
                                               │  + Azure OpenAI │
                                               └─────────────────┘
                                                       │
                                                       ▼
                                               ┌─────────────────┐
                                               │  MCP Manager    │
                                               │                 │
                                               └─────────────────┘
                                                       │
                          ┌────────────────────────────┼────────────────────────────┐
                          ▼                            ▼                            ▼
                  ┌───────────────┐          ┌───────────────┐          ┌───────────────┐
                  │ Database MCP  │          │Notification   │          │Analytics MCP  │
                  │ Server        │          │MCP Server     │          │Server         │
                  └───────────────┘          └───────────────┘          └───────────────┘
```

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Azure OpenAI Configuration
AZURE_OPENAI_API_KEY=your_azure_openai_api_key_here
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4

# System Prompt
AI_SYSTEM_PROMPT="You are an intelligent data change processor..."

# MCP Servers (YAML format)
MCP_SERVERS_CONFIG=|
  servers:
    - name: "database-tools"
      command: "node"
      args: ["./mcp-servers/database-server.js"]
      env:
        DATABASE_URL: "postgresql://user:pass@localhost:5432/db"
```

### 3. Build and Run

```bash
# Build the TypeScript
npm run build

# Run in production mode
npm start

# Run with test data
npm run test-data
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AZURE_OPENAI_API_KEY` | Azure OpenAI API key | Required |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI endpoint URL | Required |
| `AZURE_OPENAI_DEPLOYMENT_NAME` | Model deployment name | Required |
| `AI_SYSTEM_PROMPT` | System prompt for the AI agent | Default prompt |
| `MCP_SERVERS_CONFIG` | YAML configuration for MCP servers | Empty |
| `MAX_CONVERSATION_HISTORY` | Max conversation entries to keep | 50 |
| `CONVERSATION_MEMORY_TTL_HOURS` | Hours to keep conversation history | 24 |
| `LOG_LEVEL` | Logging level (debug, info, warn, error) | info |

### MCP Server Configuration

MCP servers are configured via the `MCP_SERVERS_CONFIG` environment variable in YAML format:

```yaml
servers:
  - name: "server-name"
    command: "node"  # or "python3", etc.
    args: ["path/to/server.js"]
    env:
      SERVER_SPECIFIC_VAR: "value"
```

## MCP Servers

The AI agent can interact with various MCP servers to extend its capabilities:

### Example MCP Servers

1. **Database Tools**: Execute database queries and operations
2. **Notification Service**: Send emails, Slack messages, or other notifications  
3. **Analytics Tools**: Track metrics and generate reports
4. **API Integration**: Make HTTP API calls to external services
5. **File Operations**: Read, write, and manage files

### Creating Custom MCP Servers

See the [MCP SDK documentation](https://github.com/modelcontextprotocol/typescript-sdk) for creating custom servers.

## Change Event Processing

When a change event is received:

1. **Event Analysis**: The AI agent receives the change event with context
2. **Prompt Construction**: A prompt is built using:
   - Query configuration preamble
   - Change event data in JSON format
   - Conversation history
   - Available tools description
3. **AI Processing**: The LangChain agent processes the prompt using Azure OpenAI
4. **Tool Invocation**: The agent can call MCP server tools as needed
5. **Response Generation**: The agent provides reasoning and action results

### Change Event Structure

```typescript
interface ChangeEvent {
  sequence: number;        // Sequential ID of this change
  queryId: string;         // Query that detected this change  
  addedResults: any[];     // New records added
  deletedResults: any[];   // Records removed
  updatedResults: Array<{  // Records modified
    before: any;           // Previous state
    after: any;            // New state
  }>;
}
```

## Development

### Project Structure

```
src/
├── index.ts              # Main application entry point
├── index-test.ts         # Test harness entry point
├── change-handler.ts     # Change event processing logic
├── ai-agent.ts          # LangChain AI agent implementation
├── mcp-client.ts        # MCP server management
├── conversation-memory.ts # Conversation history management
└── config.ts            # Configuration loading

test-data.json           # Sample change events for testing
.env.example            # Example environment configuration
```

### Testing

The project includes a comprehensive test harness:

```bash
# Run with sample test data
npm run test-data

# The test harness will:
# 1. Initialize AI components
# 2. Load sample change events from test-data.json  
# 3. Process each event through the AI agent
# 4. Display AI responses and actions taken
# 5. Clean up resources
```

### Debugging

Set `LOG_LEVEL=debug` in your environment for verbose logging:

```bash
LOG_LEVEL=debug npm run test-data
```

## Deployment

### Docker

Build a Docker image:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
CMD ["npm", "start"]
```

### Environment Setup

For production deployment:

1. Set up Azure OpenAI service
2. Deploy MCP servers
3. Configure environment variables
4. Set up proper logging and monitoring

## Troubleshooting

### Common Issues

1. **AI Agent Not Initializing**
   - Check Azure OpenAI credentials
   - Verify endpoint URL format
   - Ensure deployment name is correct

2. **MCP Servers Not Connecting**
   - Verify server command and arguments
   - Check server process permissions
   - Review server logs for errors

3. **Memory Issues**
   - Adjust `MAX_CONVERSATION_HISTORY`
   - Reduce `CONVERSATION_MEMORY_TTL_HOURS`
   - Monitor memory usage in production

### Fallback Behavior

If AI components fail to initialize, the agent will:
- Log the error
- Continue in basic mode
- Process change events with simple logging
- Ensure the application remains functional

## License

Apache-2.0

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Submit a pull request