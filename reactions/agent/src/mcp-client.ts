import { Client } from '@modelcontextprotocol/sdk/client/index';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp';
import { MCPServerConfig, MCPConfig } from './config';

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
}

interface MCPClientConnection {
  config: MCPServerConfig;
  client: Client;
  connected: boolean;
}

export class MCPManager {
  private tools: Map<string, MCPTool> = new Map();
  private serverConfigs: MCPServerConfig[] = [];
  private connections: Map<string, MCPClientConnection> = new Map();

  constructor(config: MCPConfig) {
    this.serverConfigs = config?.servers || [];
  }

  async initialize(): Promise<void> {
    console.log(`Initializing ${this.serverConfigs.length} MCP servers using official SDK...`);
    
    if (this.serverConfigs.length > 0) {
      // Connect to MCP servers using official SDK
      for (const serverConfig of this.serverConfigs) {
        try {
          await this.connectToServer(serverConfig);
        } catch (error) {
          console.error(`Failed to connect to MCP server ${serverConfig.name}:`, error);
        }
      }
      console.log(`Successfully connected to ${this.connections.size} MCP servers`);
    } else {
      // Fallback to mock tools if no servers configured
      console.log('No MCP servers configured, using mock tools for testing');
      this.createMockTools();
    }
    
    console.log(`Available tools: ${Array.from(this.tools.keys()).join(', ')}`);
  }

  private async connectToServer(config: MCPServerConfig): Promise<void> {
    console.log(`Connecting to MCP server: ${config.name} (type: ${config.type || 'command'})`);
    
    try {
      let transport;
      let client;
      
      if (config.type === 'http') {
        // HTTP transport for remote MCP servers
        console.log(`Creating HTTP transport for: ${config.url}`);
        transport = new StreamableHTTPClientTransport(
          new URL(config.url!),
          {
            requestInit: {
              headers: config.headers || {}
            }
          }
        );
        
        client = new Client({
          name: 'drasi-agent',
          version: '1.0.0'
        }, {
          capabilities: {}
        });
      } else {
        // STDIO transport for command-based MCP servers
        console.log(`Creating STDIO transport for: ${config.command} ${config.args?.join(' ')}`);
        transport = new StdioClientTransport({
          command: config.command!,
          args: config.args || [],
          env: config.env || {}
        });
        
        client = new Client({
          name: 'drasi-agent',
          version: '1.0.0'
        }, {
          capabilities: {}
        });
      }
      
      // Connect using the official SDK
      await client.connect(transport);
      
      // Store the connection
      this.connections.set(config.name, {
        config,
        client,
        connected: true
      });
      
      // Discover and register tools
      await this.discoverTools(config.name, client);
      
      console.log(`Successfully connected to ${config.name} MCP server`);
      
    } catch (error) {
      console.error(`Failed to connect to ${config.name}:`, error);
      throw error;
    }
  }

  private async discoverTools(serverName: string, client: Client): Promise<void> {
    try {
      console.log(`Discovering tools from ${serverName}...`);
      
      // Use the official SDK to list tools
      const response = await client.listTools();
      
      if (response && response.tools) {
        for (const tool of response.tools) {
          const toolName = `${serverName}:${tool.name}`;
          this.tools.set(toolName, {
            name: toolName,
            description: tool.description || `${tool.name} from ${serverName}`,
            inputSchema: tool.inputSchema || {
              type: 'object',
              properties: {},
              required: []
            }
          });
          console.log(`Discovered tool: ${toolName}`);
        }
      } else {
        console.log(`No tools discovered from ${serverName}`);
      }
      
    } catch (error) {
      console.error(`Failed to discover tools from ${serverName}:`, error);
      
      // Create a fallback generic tool
      const toolName = `${serverName}:call`;
      this.tools.set(toolName, {
        name: toolName,
        description: `Make calls to ${serverName} MCP server`,
        inputSchema: {
          type: 'object',
          properties: {
            tool: { type: 'string', description: 'Tool name to call' },
            arguments: { type: 'object', description: 'Arguments for the tool' }
          },
          required: ['tool']
        }
      });
      console.log(`Created fallback tool: ${toolName}`);
    }
  }

  getAvailableTools(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  async callTool(toolName: string, args: any): Promise<any> {
    console.log(`Calling tool ${toolName} with args:`, args);
    
    const [serverName, actualToolName] = toolName.split(':', 2);
    
    // Find the connection for this server
    const connection = this.connections.get(serverName);
    
    if (connection && connection.connected) {
      try {
        // Use official SDK to call the tool
        if (actualToolName === 'call' && args.tool) {
          // Generic tool call - extract the actual tool name and arguments
          console.log(`Making MCP tool call: ${args.tool}`);
          console.log(`With arguments:`, args.arguments);
          
          const response = await connection.client.callTool({
            name: args.tool,
            arguments: args.arguments || {}
          });
          
          return {
            success: true,
            response: response,
            server: serverName,
            tool: args.tool
          };
        } else {
          // Direct tool call
          console.log(`Making direct MCP tool call: ${actualToolName}`);
          
          const response = await connection.client.callTool({
            name: actualToolName,
            arguments: args
          });
          
          return {
            success: true,
            response: response,
            server: serverName,
            tool: actualToolName
          };
        }
      } catch (error) {
        console.error(`Failed to call tool ${toolName}:`, error);
        return {
          success: false,
          error: `Tool call failed: ${error}`
        };
      }
    } else {
      // Fallback to mock tools if no connection
      return this.callMockTool(toolName, args);
    }
  }

  private callMockTool(toolName: string, args: any): any {
    console.log(`Using mock tool for ${toolName}`);
    
    switch (toolName) {
      case 'logger:log_event':
      case 'logger:execute':
        const logMessage = `[${args.level || 'info'}] ${args.message || JSON.stringify(args)}`;
        console.log(`Mock Logger: ${logMessage}`);
        return { success: true, logged: logMessage };
      
      case 'notifier:send_alert':
        const alertMessage = `Alert [${args.severity || 'medium'}]: ${args.message}`;
        console.log(`Mock Notifier: ${alertMessage}`);
        return { success: true, sent: alertMessage };
      
      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  }

  private createMockTools(): void {
    // Create some mock tools for testing
    this.tools.set('logger:log_event', {
      name: 'logger:log_event',
      description: 'Log an event message',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Message to log' },
          level: { type: 'string', description: 'Log level (info, warn, error)' }
        },
        required: ['message']
      }
    });

    this.tools.set('notifier:send_alert', {
      name: 'notifier:send_alert',
      description: 'Send an alert notification',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Alert message' },
          severity: { type: 'string', description: 'Alert severity (low, medium, high)' }
        },
        required: ['message']
      }
    });
  }

  async shutdown(): Promise<void> {
    console.log('Shutting down MCP manager...');
    
    // Close all connections using the SDK
    for (const [serverName, connection] of this.connections) {
      if (connection.connected) {
        try {
          console.log(`Closing connection to ${serverName}...`);
          await connection.client.close();
          connection.connected = false;
        } catch (error) {
          console.error(`Error closing connection to ${serverName}:`, error);
        }
      }
    }
    
    this.connections.clear();
    this.tools.clear();
    console.log('MCP manager shutdown complete');
  }
}