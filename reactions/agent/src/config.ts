import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export interface MCPServerConfig {
  name: string;
  type?: 'command' | 'http';
  // For command-based servers
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // For HTTP-based servers
  url?: string;
  headers?: Record<string, string>;
}

export interface MCPConfig {
  servers: MCPServerConfig[];
}

export interface AIConfig {
  azureOpenAI: {
    apiKey: string;
    endpoint: string;
    apiVersion: string;
    deploymentName: string;
  };
  systemPrompt: string;
  maxConversationHistory: number;
  conversationMemoryTTLHours: number;
  maxWorkflowIterations: number;
  maxToolsPerIteration: number;
  maxTotalTools: number;
  workflowTimeoutMinutes: number;
}

export interface AppConfig {
  ai: AIConfig;
  mcpServers: MCPConfig;
  logLevel: string;
}

function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

function getEnvVar(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

function extractNpxServersFromConfig(mcpConfig: MCPConfig): string[] {
  const npxServers: string[] = [];
  
  for (const server of mcpConfig.servers) {
    // Check if this is an NPX-based server (command type with npx)
    if (server.type === 'command' && server.command === 'npx' && server.args) {
      // Extract the package name from args (skip -y flag if present)
      const packageArg = server.args.find(arg => !arg.startsWith('-'));
      if (packageArg) {
        npxServers.push(packageArg);
      }
    }
  }
  
  if (npxServers.length > 0) {
    console.log(`Found ${npxServers.length} NPX MCP servers to install:`, npxServers);
  }
  
  return npxServers;
}

function parseMCPServersConfig(): MCPConfig {
  const configJson = getEnvVar('MCP_SERVERS_CONFIG', '[]');
  console.log('Raw MCP_SERVERS_CONFIG:', configJson);
  
  try {
    const servers = JSON.parse(configJson) as MCPServerConfig[];
    console.log('Parsed MCP config:', { servers });
    
    if (!Array.isArray(servers)) {
      console.log('MCP_SERVERS_CONFIG is not an array, using empty array');
      return { servers: [] };
    }
    
    // Substitute environment variables in headers
    for (const server of servers) {
      if (server.headers) {
        for (const [key, value] of Object.entries(server.headers)) {
          if (typeof value === 'string') {
            // Replace ${VAR_NAME} with actual environment variable value
            const originalValue = value;
            server.headers[key] = value.replace(/\$\{([^}]+)\}/g, (match, varName) => {
              const envValue = process.env[varName];
              console.log(`Substituting ${varName}: ${envValue ? 'found' : 'not found'}`);
              return envValue || match;
            });
            if (originalValue !== server.headers[key]) {
              console.log(`Header substitution: ${key} = ${originalValue} -> ${server.headers[key]}`);
            }
          }
        }
      }
    }
    
    return { servers };
  } catch (error) {
    console.error('Failed to parse MCP_SERVERS_CONFIG:', error);
    return { servers: [] };
  }
}

export function loadConfig(): AppConfig {
  const mcpServers = parseMCPServersConfig();
  
  return {
    ai: {
      azureOpenAI: {
        apiKey: getRequiredEnvVar('AZURE_OPENAI_API_KEY'),
        endpoint: getRequiredEnvVar('AZURE_OPENAI_ENDPOINT'),
        apiVersion: getEnvVar('AZURE_OPENAI_API_VERSION', '2024-06-01'),
        deploymentName: getRequiredEnvVar('AZURE_OPENAI_DEPLOYMENT_NAME'),
      },
      systemPrompt: getEnvVar(
        'AI_SYSTEM_PROMPT',
        'You are an intelligent data change processor. Analyze incoming change events and determine appropriate actions.'
      ),
      maxConversationHistory: parseInt(getEnvVar('MAX_CONVERSATION_HISTORY', '50')),
      conversationMemoryTTLHours: parseInt(getEnvVar('CONVERSATION_MEMORY_TTL_HOURS', '24')),
      maxWorkflowIterations: parseInt(getEnvVar('MAX_WORKFLOW_ITERATIONS', '5')),
      maxToolsPerIteration: parseInt(getEnvVar('MAX_TOOLS_PER_ITERATION', '10')),
      maxTotalTools: parseInt(getEnvVar('MAX_TOTAL_TOOLS', '25')),
      workflowTimeoutMinutes: parseInt(getEnvVar('WORKFLOW_TIMEOUT_MINUTES', '10')),
    },
    mcpServers,
    logLevel: getEnvVar('LOG_LEVEL', 'info'),
  };
}

export function getNpxServersFromConfig(config: AppConfig): string[] {
  return extractNpxServersFromConfig(config.mcpServers);
}