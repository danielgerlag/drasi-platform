import { ChangeEvent } from '@drasi/reaction-sdk';
import { onChangeEvent, setAIAgent } from './change-handler';
import { loadConfig, getNpxServersFromConfig } from './config';
import { MCPManager } from './mcp-client';
import { SimpleAIAgent } from './simple-ai-agent';
import * as fs from 'fs';
import * as path from 'path';

// Test configuration
const testQueryConfig: string =  `Use the GitHub tool to fetch all the details and content about the issue.
    Analyze the issue content and determine what tools are needed to gather information and provide a comprehensive response. 
    Do research on the web regarding any suggestions or tools found in the content.
    If GitHub links come back with a 404, rather use the GitHub tools to locate to information.
    After, and ONLY after you have gathered ALL the information you can, then create a detailed summary that includes ALL relevant information that has been gathered from other issues, comments or web pages so that readers don't need to follow links or read issue history,
    and post it as a comment on the original GitHub issue, the comment must be a detailed summary of all information gathered, not just an acknowledgment.
    Use available tools as needed to complete the analysis.`;


// prompt: "Use the GitHub tool to comment on the issue with a summary"

async function loadTestData(): Promise<ChangeEvent[]> {
    try {
        //const testDataPath = path.join(__dirname, '..', 'test-data.json');
        const testDataPath = path.join(__dirname, '..', 'test-data-gh.json');
        const fileContent = fs.readFileSync(testDataPath, 'utf8');
        const testData = JSON.parse(fileContent);
        
        console.log(`📊 Loaded ${testData.length} test events from test-data.json`);
        return testData;
    } catch (error) {
        console.error('❌ Error loading test data:', error);
        process.exit(1);
    }
}

async function processTestEvents(events: ChangeEvent[]): Promise<void> {
    console.log('🚀 Starting test event processing...\n');
    
    for (let i = 0; i < events.length; i++) {
        const event = events[i];
        console.log(`\n${'='.repeat(50)}`);
        console.log(`📋 Processing Event ${i + 1}/${events.length}`);
        // console.log(`   Sequence: ${event.sequence}`);
        // console.log(`   Query ID: ${event.queryId}`);
        // console.log(`   Added: ${event.addedResults?.length || 0} items`);
        // console.log(`   Deleted: ${event.deletedResults?.length || 0} items`);
        // console.log(`   Updated: ${event.updatedResults?.length || 0} items`);
        console.log(`${'='.repeat(50)}`);
        
        try {
            await onChangeEvent(event, testQueryConfig);
            console.log(`✅ Event ${i + 1} processed successfully`);
        } catch (error) {
            console.error(`❌ Error processing event ${i + 1}:`, error);
        }
        
        // Add a small delay between events for better readability
        if (i < events.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
}

async function initializeTestAI(): Promise<{ aiAgent: SimpleAIAgent; mcpManager: MCPManager } | null> {
    try {
        console.log('🚀 Initializing AI components for testing...');
        
        // Load configuration
        const config = loadConfig();
        
        // Initialize MCP Manager
        const mcpManager = new MCPManager(config.mcpServers);
        
        // Install NPX MCP servers first
        const npxServers = getNpxServersFromConfig(config);
        await mcpManager.installNpxMcpServers(npxServers);
        
        // Then initialize MCP connections
        await mcpManager.initialize();
        
        // Initialize AI Agent
        const aiAgent = new SimpleAIAgent(config.ai, mcpManager);
        await aiAgent.initialize();
        
        // Set the AI agent in the change handler
        setAIAgent(aiAgent);
        
        console.log('✅ AI components initialized successfully for testing');
        
        return { aiAgent, mcpManager };
    } catch (error) {
        console.error('❌ Failed to initialize AI components for testing:', error);
        console.log('⚠️ Continuing with basic testing mode...');
        return null;
    }
}

async function main(): Promise<void> {
    console.log('🧪 Drasi AI Agent Reaction - Test Mode');
    console.log('=====================================\n');
    
    // Initialize AI components
    const aiComponents = await initializeTestAI();
    
    try {
        const testEvents = await loadTestData();
        await processTestEvents(testEvents);
        
        console.log('\n🎉 All test events processed successfully!');
        console.log('Test run completed. The agent would normally continue listening for real events.');
        
        // Cleanup AI components if they were initialized
        if (aiComponents) {
            console.log('\n🔄 Cleaning up AI components...');
            await aiComponents.aiAgent.shutdown();
            await aiComponents.mcpManager.shutdown();
        }
        
        console.log('✅ Test completed successfully. Exiting...');
        
        // Force exit after a brief delay to allow cleanup
        setTimeout(() => {
            console.log('🔚 Forcing process exit...');
            process.exit(0);
        }, 1000);
        
    } catch (error) {
        console.error('💥 Test run failed:', error);
        
        // Cleanup on error
        if (aiComponents) {
            await aiComponents.aiAgent.shutdown();
            await aiComponents.mcpManager.shutdown();
        }
        
        process.exit(1);
    }
}

// Run the test if this file is executed directly
if (require.main === module) {
    main().catch(console.error);
}