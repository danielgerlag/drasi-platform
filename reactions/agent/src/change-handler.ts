import { ChangeEvent } from '@drasi/reaction-sdk';
import { MyQueryConfig } from './index';
import { SimpleAIAgent } from './simple-ai-agent';

// Global AI agent instance (initialized in index.ts)
let aiAgent: SimpleAIAgent | null = null;

export function setAIAgent(agent: SimpleAIAgent): void {
    aiAgent = agent;
}

export async function onChangeEvent(event: ChangeEvent, queryConfig?: MyQueryConfig): Promise<void> {
    console.log(`📥 Received change sequence: ${event.sequence} for query ${event.queryId}`);
    
    // Log basic event info
    const addedCount = event.addedResults?.length || 0;
    const deletedCount = event.deletedResults?.length || 0;
    const updatedCount = event.updatedResults?.length || 0;
    
    console.log(`📊 Change summary: ${addedCount} added, ${deletedCount} deleted, ${updatedCount} updated`);

    // Convert the change event to JSON for the AI agent
    const changeEventJson = JSON.stringify(event, null, 2);
    
    // Get the preamble from query config
    const preamble = queryConfig?.prompt || "A data change event has occurred and needs to be processed.";
    
    if (aiAgent) {
        try {
            console.log('🤖 Processing change event with AI agent...');
            
            const aiResponse = await aiAgent.processChangeEvent(
                event.queryId,
                preamble,
                changeEventJson
            );
            
            console.log('🤖 AI Agent Response:');
            console.log('═'.repeat(60));
            console.log(aiResponse);
            console.log('═'.repeat(60));
            
        } catch (error) {
            console.error('❌ Error processing change event with AI agent:', error);
            
            // Fallback to basic logging if AI processing fails
            console.log('📋 Falling back to basic change event logging...');
            await logChangeEventBasic(event, queryConfig);
        }
    } else {
        console.log('⚠️ AI agent not available, using basic change event logging...');
        await logChangeEventBasic(event, queryConfig);
    }
}

async function logChangeEventBasic(event: ChangeEvent, queryConfig?: MyQueryConfig): Promise<void> {
    console.log(queryConfig?.prompt || "A data change event has occurred.");
    
    for (let added of event.addedResults) {
        console.log(`➕ Added result: ${JSON.stringify(added)}`);
    }
    
    for (let deleted of event.deletedResults) {
        console.log(`➖ Removed result: ${JSON.stringify(deleted)}`);
    }
    
    for (let updated of event.updatedResults) {
        console.log(`🔄 Updated result - before: ${JSON.stringify(updated.before)}, after: ${JSON.stringify(updated.after)}`);
    }
}
