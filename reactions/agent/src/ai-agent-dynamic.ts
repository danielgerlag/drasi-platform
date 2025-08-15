// AI Agent with dynamic LangChain imports to avoid TypeScript compilation issues
import { MCPManager, MCPTool } from './mcp-client.js';
import { AIConfig } from './config.js';
import { ConversationMemory } from './conversation-memory.js';

export class AIAgent {
  private mcpManager: MCPManager;
  private conversationMemory: ConversationMemory;
  private systemPrompt: string;
  private config: AIConfig;
  private llm: any = null;

  constructor(config: AIConfig, mcpManager: MCPManager) {
    this.mcpManager = mcpManager;
    this.systemPrompt = config.systemPrompt;
    this.config = config;
    
    // Initialize conversation memory
    this.conversationMemory = new ConversationMemory(
      config.maxConversationHistory,
      config.conversationMemoryTTLHours
    );
  }

  private extractInstanceName(endpoint: string): string {
    const match = endpoint.match(/https:\/\/([^.]+)\.openai\.azure\.com/);
    if (!match) {
      throw new Error(`Invalid Azure OpenAI endpoint format: ${endpoint}`);
    }
    return match[1];
  }

  async initialize(): Promise<void> {
    console.log('Initializing AI Agent with Azure OpenAI...');
    console.log(`Azure OpenAI Endpoint: ${this.config.azureOpenAI.endpoint}`);
    console.log(`Deployment: ${this.config.azureOpenAI.deploymentName}`);
    
    try {
      // Dynamic import of LangChain to avoid compilation timeout
      const { ChatOpenAI } = await import('@langchain/openai');
      
      this.llm = new ChatOpenAI({
        azureOpenAIApiKey: this.config.azureOpenAI.apiKey,
        azureOpenAIApiInstanceName: this.extractInstanceName(this.config.azureOpenAI.endpoint),
        azureOpenAIApiDeploymentName: this.config.azureOpenAI.deploymentName,
        azureOpenAIApiVersion: this.config.azureOpenAI.apiVersion,
        temperature: 0.7,
        modelName: this.config.azureOpenAI.deploymentName,
      });
      
      console.log('✅ AI Agent initialized with real Azure OpenAI integration');
    } catch (error) {
      console.error('❌ Failed to initialize Azure OpenAI:', error);
      console.log('⚠️ Continuing in mock mode');
    }
  }

  async processChangeEvent(queryId: string, preamble: string, changeEventJson: string): Promise<string> {
    const chatHistory = this.conversationMemory.getHistory(queryId);
    const availableTools = this.mcpManager.getAvailableTools();
    
    try {
      if (!this.llm) {
        throw new Error('Azure OpenAI not initialized');
      }

      // Parse the change event for tool usage
      const changeEvent = JSON.parse(changeEventJson);
      
      // Create the system prompt
      const systemMessage = `${this.systemPrompt}

Available tools:
${availableTools.map(t => `- ${t.name}: ${t.description}`).join('\n')}

When analyzing change events, consider:
- The type of change (added, deleted, updated)
- The impact and significance of the change
- What actions might be needed based on the change
- Whether any tools should be invoked to handle the change

IMPORTANT: Only recommend tools that are directly relevant to the specific change event. Be selective and specific.

If you determine that a tool should be used, include EXACTLY one of these statements for each tool:
- "I will use the [exact-tool-name] tool to [action]"
- "I recommend using [exact-tool-name] to [action]"

Do NOT recommend tools unless they are specifically needed for this change event. Avoid generic mentions of tools.

Always provide your reasoning and any specific actions you recommend.`;

      const userMessage = `${preamble}

## Change Event Data
${changeEventJson}

## Previous Conversation Context
${chatHistory}

Please analyze this change event and determine what actions, if any, should be taken.`;

      // Dynamic import of messages
      const { HumanMessage, SystemMessage } = await import('@langchain/core/messages');

      const messages = [
        new SystemMessage(systemMessage),
        new HumanMessage(userMessage),
      ];

      // Call Azure OpenAI
      console.log('🤖 Calling Azure OpenAI for analysis...');
      const response = await this.llm.invoke(messages);
      
      let responseText = '';
      if (typeof response.content === 'string') {
        responseText = response.content;
      } else {
        responseText = JSON.stringify(response.content);
      }

      console.log('✅ Received response from Azure OpenAI');
      console.log('🔍 AI Response:', responseText);

      // Execute recommended tools
      await this.executeRecommendedTools(responseText, availableTools, changeEvent, queryId);

      // Store interaction in memory
      this.conversationMemory.addInteraction(queryId, userMessage, responseText);

      return responseText;
      
    } catch (error) {
      console.error('❌ Error with Azure OpenAI:', error);
      console.log('🔄 Falling back to mock analysis...');
      return this.generateMockAnalysis(queryId, preamble, changeEventJson);
    }
  }

  private async executeRecommendedTools(aiResponse: string, availableTools: MCPTool[], changeEvent: any, queryId: string): Promise<void> {
    console.log(`🔧 DEBUG: Starting tool recommendation parsing...`);
    console.log(`🔧 DEBUG: Available tools: ${availableTools.map(t => t.name).join(', ')}`);
    
    // Only look for very explicit tool usage statements
    const explicitToolUsagePattern = /(?:^|\n|\. )(I will use|I recommend using|I'll use|Let me use|I should use|I will invoke|I'll invoke|I will call|I'll call)\s+(?:the\s+)?([a-zA-Z0-9_:-]+)\s+tool/gim;
    
    const recommendedTools = new Set<string>();
    
    // Extract only explicitly recommended tools
    let match;
    while ((match = explicitToolUsagePattern.exec(aiResponse)) !== null) {
      const toolName = match[2].trim().toLowerCase();
      console.log(`🎯 Found explicit tool recommendation: "${match[0].trim()}" -> tool: "${toolName}"`);
      recommendedTools.add(toolName);
    }
    
    console.log(`🔍 AI explicitly recommended ${recommendedTools.size} tools: ${Array.from(recommendedTools).join(', ')}`);
    
    // Only execute tools that were explicitly recommended
    if (recommendedTools.size === 0) {
      console.log(`ℹ️ AI did not explicitly recommend any tools for execution`);
      return;
    }
    
    for (const recommendedToolName of recommendedTools) {
      // Find exact matching tools only
      const matchingTools = availableTools.filter(tool => {
        const toolNameLower = tool.name.toLowerCase();
        return toolNameLower === recommendedToolName || toolNameLower.endsWith(':' + recommendedToolName);
      });
      
      if (matchingTools.length === 0) {
        console.log(`⚠️ No matching tool found for recommendation: ${recommendedToolName}`);
        continue;
      }
      
      for (const tool of matchingTools) {
        console.log(`🔧 Executing explicitly recommended tool: ${tool.name}`);
        
        try {
          let action = 'process';
          let data: any = { queryId, timestamp: new Date().toISOString() };
          
          if (changeEvent.addedResults?.length > 0) {
            action = 'log_addition';
            data.message = `${changeEvent.addedResults.length} items added to ${queryId}`;
            data.items = changeEvent.addedResults;
          } else if (changeEvent.deletedResults?.length > 0) {
            action = 'alert_deletion';
            data.message = `${changeEvent.deletedResults.length} items deleted from ${queryId}`;
            data.items = changeEvent.deletedResults;
          } else if (changeEvent.updatedResults?.length > 0) {
            action = 'log_update';
            data.message = `${changeEvent.updatedResults.length} items updated in ${queryId}`;
            data.items = changeEvent.updatedResults;
          }
          
          const toolResult = await this.mcpManager.callTool(tool.name, { action, data });
          console.log(`✅ Tool ${tool.name} executed successfully:`, toolResult);
          
        } catch (error) {
          console.error(`❌ Failed to execute tool ${tool.name}:`, error);
        }
      }
    }
  }

  private generateMockAnalysis(queryId: string, preamble: string, changeEventJson: string): string {
    const changeEvent = JSON.parse(changeEventJson);
    const availableTools = this.mcpManager.getAvailableTools();
    const chatHistory = this.conversationMemory.getHistory(queryId);
    
    let analysis = `${preamble}\n\n## AI Analysis (Fallback Mode)\n\n`;
    analysis += `**Change Event Summary:**\n`;
    analysis += `- Sequence: ${changeEvent.sequence}\n`;
    analysis += `- Query ID: ${changeEvent.queryId}\n`;
    analysis += `- Added items: ${changeEvent.addedResults?.length || 0}\n`;
    analysis += `- Deleted items: ${changeEvent.deletedResults?.length || 0}\n`;
    analysis += `- Updated items: ${changeEvent.updatedResults?.length || 0}\n\n`;
    
    if (changeEvent.addedResults?.length > 0) {
      analysis += `**New Items Detected - would recommend using available tools for processing**\n`;
    }
    
    if (changeEvent.deletedResults?.length > 0) {
      analysis += `**Items Removed - would recommend alerts and archival**\n`;
    }
    
    if (chatHistory && chatHistory !== 'No previous conversation history.') {
      analysis += `\n**Context maintained from previous interactions**\n`;
    }
    
    analysis += `\n**Available Tools:** ${availableTools.map(t => t.name).join(', ')}\n`;
    
    this.conversationMemory.addInteraction(queryId, `${preamble}\n\n${changeEventJson}`, analysis);
    return analysis;
  }

  async shutdown(): Promise<void> {
    console.log('Shutting down AI Agent...');
    this.conversationMemory.cleanup();
  }
}