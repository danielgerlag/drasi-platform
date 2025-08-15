import * as dotenv from 'dotenv';
import * as yaml from 'js-yaml';

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

function parseMCPServersConfig(): MCPConfig {
  const configYaml = getEnvVar('MCP_SERVERS_CONFIG', 'servers: []');
  console.log('Raw MCP_SERVERS_CONFIG:', configYaml);
  
  try {
    const config = yaml.load(configYaml) as MCPConfig;
    console.log('Parsed MCP config:', config);
    
    if (!config || !config.servers) {
      console.log('No servers found in config, using empty array');
      return { servers: [] };
    }
    
    // Substitute environment variables in headers
    for (const server of config.servers) {
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
    
    return config;
  } catch (error) {
    console.error('Failed to parse MCP_SERVERS_CONFIG:', error);
    return { servers: [] };
  }
}

export function loadConfig(): AppConfig {
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
    },
    mcpServers: parseMCPServersConfig(),
    logLevel: getEnvVar('LOG_LEVEL', 'info'),
  };
}