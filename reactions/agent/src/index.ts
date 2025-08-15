import { DrasiReaction, parseYaml, ControlEvent, getConfigValue } from '@drasi/reaction-sdk';
import { onChangeEvent, setAIAgent } from './change-handler';
import { loadConfig } from './config';
import { MCPManager } from './mcp-client';
import { SimpleAIAgent } from './simple-ai-agent';

// Load configuration from environment variables
const config = loadConfig();

// Retrieve the connection string from the Reaction configuration
const myConnectionString = getConfigValue("MyConnectionString");

// Define a custom per query configuration object
export class MyQueryConfig {
    prompt: string = "A data change event has occurred.";
}

// Initialize AI components
async function initializeAI(): Promise<void> {
    try {
        console.log('🚀 Initializing AI components...');
        
        // Initialize MCP Manager
        const mcpManager = new MCPManager(config.mcpServers);
        await mcpManager.initialize();
        
        // Initialize AI Agent
        const aiAgent = new SimpleAIAgent(config.ai, mcpManager);
        await aiAgent.initialize();
        
        // Set the AI agent in the change handler
        setAIAgent(aiAgent);
        
        console.log('✅ AI components initialized successfully');
        
        // Setup graceful shutdown
        process.on('SIGINT', async () => {
            console.log('🔄 Shutting down AI components...');
            await aiAgent.shutdown();
            await mcpManager.shutdown();
            process.exit(0);
        });
        
        process.on('SIGTERM', async () => {
            console.log('🔄 Shutting down AI components...');
            await aiAgent.shutdown();
            await mcpManager.shutdown();
            process.exit(0);
        });
        
    } catch (error) {
        console.error('❌ Failed to initialize AI components:', error);
        console.log('⚠️ Continuing without AI agent (basic mode)...');
    }
}

// Define the function that will be called when a control event is received
async function onControlEvent(event: ControlEvent, queryConfig?: MyQueryConfig): Promise<void> {    
    console.log(`📋 Received control signal: ${JSON.stringify(event.controlSignal)} for query ${event.queryId}`);    
}

async function main(): Promise<void> {
    console.log('🌟 Starting Drasi AI Agent Reaction');
    console.log('====================================');
    console.log(`Connection string: ${myConnectionString}`);
    console.log(`Log level: ${config.logLevel}`);
    console.log(`Max conversation history: ${config.ai.maxConversationHistory}`);
    console.log(`MCP servers configured: ${config.mcpServers.servers.length}`);
    
    // Initialize AI components
    await initializeAI();
    
    // Configure the Reaction with the onChangeEvent and onControlEvent functions
    let myReaction = new DrasiReaction<MyQueryConfig>(onChangeEvent, {
        parseQueryConfig: parseYaml, // Parse the per query configuration from Yaml
        onControlEvent: onControlEvent
    });

    // Start the Reaction
    console.log('🎯 Starting Drasi reaction listener...');
    myReaction.start();
}

// Start the application
main().catch(console.error);
