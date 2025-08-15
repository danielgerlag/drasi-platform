import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { MCPManager, MCPTool } from './mcp-client';
import { AIConfig } from './config';
import { ConversationMemory } from './conversation-memory';

export class SimpleAIAgent {
  private llm: ChatOpenAI;
  private mcpManager: MCPManager;
  private conversationMemory: ConversationMemory;
  private systemPrompt: string;
  private config: AIConfig;

  constructor(config: AIConfig, mcpManager: MCPManager) {
    this.mcpManager = mcpManager;
    this.systemPrompt = config.systemPrompt;
    this.config = config;
    
    // Initialize Azure OpenAI
    this.llm = new ChatOpenAI({
      azureOpenAIApiKey: config.azureOpenAI.apiKey,
      azureOpenAIApiInstanceName: this.extractInstanceName(config.azureOpenAI.endpoint),
      azureOpenAIApiDeploymentName: config.azureOpenAI.deploymentName,
      azureOpenAIApiVersion: config.azureOpenAI.apiVersion,
      temperature: 0.1,
      modelName: config.azureOpenAI.deploymentName,
    });
    
    // Initialize conversation memory
    this.conversationMemory = new ConversationMemory(
      config.maxConversationHistory,
      config.conversationMemoryTTLHours
    );
  }

  private extractInstanceName(endpoint: string): string {
    // Extract instance name from Azure OpenAI endpoint
    // e.g., "https://my-resource.openai.azure.com/" -> "my-resource"
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
    console.log('✅ AI Agent initialized with real Azure OpenAI integration');
  }

  async processChangeEvent(queryId: string, preamble: string, changeEventJson: string): Promise<string> {
    // Get conversation history for this query
    const chatHistory = this.conversationMemory.getHistory(queryId);
    const availableTools = this.mcpManager.getAvailableTools();
    
    try {
      // Parse the change event for tool usage
      const changeEvent = JSON.parse(changeEventJson);
      
      // Create the system prompt with available tools
      const systemMessage = `${this.systemPrompt}

Available tools:
${availableTools.map(t => `- ${t.name}: ${t.description}`).join('\n')}

When analyzing change events, consider:
- The type of change (added, deleted, updated)
- The impact and significance of the change
- What actions might be needed based on the change
- Whether any tools should be invoked to handle the change

IMPORTANT: You MUST use available tools to complete tasks. Do not just describe what should be done - actually specify the tools to use.

When you identify actions needed, explicitly mention the specific tools you will use with their exact names from the available tools list.

For each tool you want to use, include one of these exact statements:
- "I will use \`exact-tool-name\` to action"
- "\`exact-tool-name\` tool"
- "Use \`exact-tool-name\`"

Always specify concrete tool usage rather than just describing abstract actions.`;

      const userMessage = `${preamble}

## Change Event Data
The following change event has occurred and needs to be processed:

\`\`\`json
${changeEventJson}
\`\`\`

## Change Event Structure Reference
/*
 * ChangeEvent represents a data change notification
 * - sequence: number - Sequential ID of this change event
 * - queryId: string - Identifier of the query that detected this change
 * - addedResults: array - New records that were added
 * - deletedResults: array - Records that were removed
 * - updatedResults: array - Records that were modified (contains 'before' and 'after' objects)
 */

## Previous Conversation Context
${chatHistory}

Please analyze this change event and determine what actions, if any, should be taken.`;

      // Create the messages directly
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

      // Execute recommended tools and continue workflow if needed
      const toolResults = await this.executeRecommendedTools(responseText, availableTools, changeEvent, queryId);
      
      // If tools were executed and the task isn't complete, continue the workflow
      if (toolResults.length > 0) {
        let allToolResults = [...toolResults];
        let currentResponse = responseText;
        
        // Continue workflow until complete (max 3 iterations to prevent infinite loops)
        for (let iteration = 0; iteration < 3; iteration++) {
          const followUpResponse = await this.continueWorkflow(currentResponse, allToolResults, availableTools, changeEvent, queryId);
          if (followUpResponse) {
            currentResponse += '\n\n' + followUpResponse.response;
            allToolResults.push(...followUpResponse.newResults);
            
            // If no new tools were executed, the workflow is complete
            if (followUpResponse.newResults.length === 0) {
              break;
            }
          } else {
            // No follow-up needed, workflow is complete
            break;
          }
        }
        
        responseText = currentResponse;
      }

      // Store this interaction in conversation memory
      this.conversationMemory.addInteraction(queryId, userMessage, responseText);

      return responseText;
      
    } catch (error) {
      console.error('❌ Error with Azure OpenAI:', error);
      
      // Fallback to mock analysis if OpenAI fails
      console.log('🔄 Falling back to mock analysis...');
      return this.generateMockAnalysis(queryId, preamble, changeEventJson);
    }
  }

  private async executeRecommendedTools(aiResponse: string, availableTools: MCPTool[], changeEvent: any, queryId: string): Promise<Array<{tool: string, result: any}>> {
    console.log(`🔧 Starting tool recommendation parsing...`);
    
    // Look for tool mentions in various formats - completely generic
    const toolMentionPatterns = [
      /(?:use|using|invoke|call)\s+(?:the\s+)?(?:`([^`]+)`|([a-zA-Z0-9_:-]+))\s*tool/gim,
      /\[([a-zA-Z0-9_:-]+)\]/gim,
      /(?:I will use|I'll use|Let me use)\s+(?:the\s+)?(?:`([^`]+)`|([a-zA-Z0-9_:-]+))/gim,
      /\*\*`([^`]+)`\*\*/gim,  // **`github:add_issue_comment`** format
      /`([a-zA-Z0-9_:-]+)`/gim  // Generic backtick format
    ];
    
    const recommendedTools = new Set<string>();
    
    // Extract tools mentioned in any of the patterns
    for (const pattern of toolMentionPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(aiResponse)) !== null) {
        // Extract tool name from any capture group
        let toolName = '';
        for (let i = 1; i < match.length; i++) {
          if (match[i]) {
            toolName = match[i].trim().toLowerCase();
            break;
          }
        }
        
        // Only add if it's a valid tool name and matches available tools
        if (toolName && toolName !== 'this' && toolName !== 'tool' && toolName !== 'following') {
          const matchingTool = availableTools.find(t => 
            t.name.toLowerCase() === toolName || 
            t.name.toLowerCase().endsWith(':' + toolName)
          );
          
          if (matchingTool) {
            console.log(`🎯 Found tool recommendation: "${match[0].trim()}" -> tool: "${matchingTool.name}"`);
            recommendedTools.add(matchingTool.name.toLowerCase());
          }
        }
      }
    }
    
    console.log(`🔍 AI explicitly recommended ${recommendedTools.size} tools: ${Array.from(recommendedTools).join(', ')}`);
    
    // Only execute tools that were explicitly recommended
    if (recommendedTools.size === 0) {
      console.log(`ℹ️ AI did not explicitly recommend any tools for execution`);
      return [];
    }
    
    const toolResults: Array<{tool: string, result: any}> = [];
    
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
          // Let the AI determine the appropriate arguments for the tool
          const toolArgs = await this.generateToolArguments(tool, changeEvent, queryId, toolResults);
          
          console.log(`🔧 Calling ${tool.name} with AI-generated arguments:`, toolArgs);
          const toolResult = await this.mcpManager.callTool(tool.name, toolArgs);
          console.log(`✅ Tool ${tool.name} executed successfully:`, JSON.stringify(toolResult, null, 2));
          
          // Store the result for potential follow-up actions
          toolResults.push({ tool: tool.name, result: toolResult });
          
        } catch (error) {
          console.error(`❌ Failed to execute tool ${tool.name}:`, error);
        }
      }
    }
    
    return toolResults;
  }

  private async generateToolArguments(tool: MCPTool, changeEvent: any, queryId: string, previousToolResults: Array<{tool: string, result: any}> = []): Promise<any> {
    try {
      // Use AI to generate appropriate tool arguments based on the tool schema and available data
      const systemMessage = `You are a tool argument generator. Given a tool schema, change event data, and previous tool results, generate the correct JSON arguments to call the tool.

Tool: ${tool.name}
Description: ${tool.description}
Schema: ${JSON.stringify(tool.inputSchema, null, 2)}

Rules:
1. Return ONLY valid JSON that matches the tool's input schema
2. Use data from the change event when relevant
3. Use data from previous tool results when available
4. Extract information from URLs, IDs, and other structured data
5. Do not wrap JSON in markdown code blocks
6. Do not include any explanation, only the JSON object`;

      const userMessage = `Change Event Data:
${JSON.stringify(changeEvent, null, 2)}

Previous Tool Results:
${JSON.stringify(previousToolResults, null, 2)}

Query ID: ${queryId}
Timestamp: ${new Date().toISOString()}

Context: ${previousToolResults.length > 0 ? 'Use the previous tool results to create detailed, informative content.' : 'This is the first tool call in the workflow.'}

Generate the appropriate arguments for calling ${tool.name}:`;

      const messages = [
        new SystemMessage(systemMessage),
        new HumanMessage(userMessage),
      ];

      console.log(`🤖 Asking AI to generate arguments for ${tool.name}...`);
      const response = await this.llm.invoke(messages);
      
      let responseText = '';
      if (typeof response.content === 'string') {
        responseText = response.content;
      } else {
        responseText = JSON.stringify(response.content);
      }

      // Parse the AI response as JSON (handle markdown code blocks)
      try {
        let jsonText = responseText.trim();
        
        // Remove markdown code blocks if present
        if (jsonText.startsWith('```json')) {
          jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (jsonText.startsWith('```')) {
          jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }
        
        const toolArgs = JSON.parse(jsonText);
        console.log(`✅ AI generated valid arguments for ${tool.name}`);
        return toolArgs;
      } catch (parseError) {
        console.error(`❌ AI response was not valid JSON for ${tool.name}:`, responseText);
        // Fallback to basic arguments
        return {
          queryId,
          timestamp: new Date().toISOString(),
          eventData: changeEvent
        };
      }
      
    } catch (error) {
      console.error(`❌ Failed to generate tool arguments for ${tool.name}:`, error);
      // Fallback to basic arguments
      return {
        queryId,
        timestamp: new Date().toISOString(),
        eventData: changeEvent
      };
    }
  }


  private async continueWorkflow(originalResponse: string, toolResults: Array<{tool: string, result: any}>, availableTools: MCPTool[], changeEvent: any, queryId: string): Promise<{response: string, newResults: Array<{tool: string, result: any}>} | null> {
    try {
      console.log(`🔄 Analyzing tool results to determine next steps...`);
      
      // Create a system message for workflow continuation
      const systemMessage = `You are continuing a workflow. Based on the previous analysis and tool results, determine if additional tools should be used to complete the task.

Previous analysis: ${originalResponse}

Tool results: ${JSON.stringify(toolResults, null, 2)}

Available tools:
${availableTools.map(t => `- ${t.name}: ${t.description}`).join('\n')}

WORKFLOW GUIDANCE:
- If you have gathered sufficient data through previous tool calls, now create comprehensive outputs using available tools
- Always look for web links (URLs) in the content from previous tool results
- If you find any HTTP/HTTPS URLs, use available web browsing tools to extract content from those links
- Use all information from previous tool results AND web content to create detailed, informative content
- Always complete workflows by producing final outputs that utilize all gathered information
- When creating comments or summaries, include all relevant details from the data you've collected AND from any web pages you visited

If additional tools are needed to complete the task, specify them clearly.
If the task is complete or no additional tools are needed, respond with "WORKFLOW_COMPLETE".`;

      const userMessage = `Based on the tool results above, what additional steps (if any) are needed to complete the original task?

Original change event: ${JSON.stringify(changeEvent, null, 2)}`;

      const messages = [
        new SystemMessage(systemMessage),
        new HumanMessage(userMessage),
      ];

      console.log(`🤖 Asking AI for next steps in workflow...`);
      const response = await this.llm.invoke(messages);
      
      let responseText = '';
      if (typeof response.content === 'string') {
        responseText = response.content;
      } else {
        responseText = JSON.stringify(response.content);
      }

      console.log(`🔍 Workflow continuation response: ${responseText}`);

      // If the AI says the workflow is complete, stop here
      if (responseText.includes('WORKFLOW_COMPLETE')) {
        console.log(`✅ Workflow marked as complete by AI`);
        return null;
      }

      // Execute any additional recommended tools
      const additionalResults = await this.executeRecommendedTools(responseText, availableTools, changeEvent, queryId);
      
      if (additionalResults.length > 0) {
        console.log(`✅ Executed ${additionalResults.length} additional tools in workflow`);
        return {
          response: responseText,
          newResults: additionalResults
        };
      }

      return null;
      
    } catch (error) {
      console.error(`❌ Error in workflow continuation:`, error);
      return null;
    }
  }

  private generateMockAnalysis(queryId: string, preamble: string, changeEventJson: string): string {
    const changeEvent = JSON.parse(changeEventJson);
    const availableTools = this.mcpManager.getAvailableTools();
    
    let analysis = `${preamble}\n\n`;
    analysis += `## AI Analysis (Mock Mode)\n\n`;
    analysis += `**Change Event Summary:**\n`;
    analysis += `- Sequence: ${changeEvent.sequence}\n`;
    analysis += `- Query ID: ${changeEvent.queryId}\n`;
    analysis += `- Added items: ${changeEvent.addedResults?.length || 0}\n`;
    analysis += `- Deleted items: ${changeEvent.deletedResults?.length || 0}\n`;
    analysis += `- Updated items: ${changeEvent.updatedResults?.length || 0}\n\n`;
    
    // Analyze the type of changes
    if (changeEvent.addedResults?.length > 0) {
      analysis += `**New Items Detected:**\n`;
      for (const item of changeEvent.addedResults.slice(0, 2)) {
        analysis += `- ${JSON.stringify(item).substring(0, 100)}...\n`;
      }
      analysis += `\n**Recommended Actions:**\n`;
      analysis += `- Monitor new data for quality and compliance\n`;
      analysis += `- Update relevant dashboards and reports\n`;
      
      // Use available tools  
      const loggerTool = availableTools.find(t => t.name.toLowerCase().includes('logger'));
      if (loggerTool) {
        analysis += `- Would use ${loggerTool.name} for logging\n`;
      }
    }
    
    if (changeEvent.deletedResults?.length > 0) {
      analysis += `\n**Items Removed:**\n`;
      analysis += `- ${changeEvent.deletedResults.length} items were deleted\n`;
      analysis += `\n**Recommended Actions:**\n`;
      analysis += `- Verify deletion was intentional\n`;
      analysis += `- Archive deleted data if required\n`;
      
      const notifierTool = availableTools.find(t => t.name.toLowerCase().includes('notifier') || t.name.toLowerCase().includes('alert'));
      if (notifierTool) {
        analysis += `- Would use ${notifierTool.name} for alerts\n`;
      }
    }
    
    if (changeEvent.updatedResults?.length > 0) {
      analysis += `\n**Items Modified:**\n`;
      analysis += `- ${changeEvent.updatedResults.length} items were updated\n`;
      
      // Analyze the nature of updates
      const significantChanges = changeEvent.updatedResults.filter((update: any) => {
        const beforeStr = JSON.stringify(update.before);
        const afterStr = JSON.stringify(update.after);
        return Math.abs(beforeStr.length - afterStr.length) > 10;
      });
      
      if (significantChanges.length > 0) {
        analysis += `- ${significantChanges.length} significant changes detected\n`;
        analysis += `\n**Recommended Actions:**\n`;
        analysis += `- Review significant changes for accuracy\n`;
        analysis += `- Update downstream systems\n`;
      }
    }
    
    // Add context from conversation history  
    const chatHistory = this.conversationMemory.getHistory(queryId);
    if (chatHistory && chatHistory !== 'No previous conversation history.') {
      analysis += `\n**Context from Previous Interactions:**\n`;
      analysis += `- This query has previous conversation history\n`;
      analysis += `- Maintaining continuity with past analysis\n`;
    }
    
    analysis += `\n**Available Tools:** ${availableTools.map(t => t.name).join(', ')}\n`;
    analysis += `\n**System Prompt:** ${this.systemPrompt}\n`;
    
    // Store this interaction in conversation memory
    this.conversationMemory.addInteraction(queryId, `${preamble}\n\nChange Event: ${changeEventJson}`, analysis);

    return analysis;
  }

  async shutdown(): Promise<void> {
    console.log('Shutting down AI Agent...');
    this.conversationMemory.cleanup();
  }
}