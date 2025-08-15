# Claude Code Assistant Guidelines

## CRITICAL REQUIREMENT: NO TOOL-SPECIFIC HARDCODED LOGIC

**NEVER HARD CODE ANY TOOL-SPECIFIC LOGIC IN THIS CODEBASE**

This system must remain completely **CONFIG-DRIVEN** and **AI-DRIVEN**.

## Forbidden Practices

### ❌ DO NOT DO THESE:

1. **No hardcoded tool name checks**:
   ```typescript
   // ❌ FORBIDDEN
   if (tool.name.startsWith('playwright:')) { ... }
   if (tool.name.includes('github:')) { ... }
   ```

2. **No forced tool execution**:
   ```typescript
   // ❌ FORBIDDEN
   await this.mcpManager.callTool('playwright:browser_navigate', { url: cleanUrl });
   ```

3. **No tool-specific filtering**:
   ```typescript
   // ❌ FORBIDDEN
   const filteredToolUrls = toolResultUrls.filter(url => 
     !url.includes('api.github.com')
   );
   ```

4. **No hardcoded URL detection for specific tools**:
   ```typescript
   // ❌ FORBIDDEN
   const hasPlaywrightTools = availableTools.some(t => t.name.startsWith('playwright:'));
   ```

5. **No tool-specific workflow guidance**:
   ```typescript
   // ❌ FORBIDDEN
   "If you find URLs, you MUST use playwright tools to browse them"
   ```

6. **No hardcoded tool names in prompts**:
   ```typescript
   // ❌ FORBIDDEN
   prompt: "Use github:get_issue tool first, then playwright tools..."
   ```

## Required Approach

### ✅ DO THIS INSTEAD:

1. **AI-driven tool discovery**:
   - Let the AI analyze available tool schemas
   - AI chooses appropriate tools based on task requirements

2. **Generic workflow guidance**:
   ```typescript
   // ✅ CORRECT
   "Use available web browsing tools to extract content from links"
   "Use available tools as needed to complete the analysis"
   ```

3. **Config-driven prompts**:
   ```typescript
   // ✅ CORRECT
   prompt: "Analyze content and determine what tools are needed"
   ```

4. **AI-driven argument generation**:
   - AI generates tool arguments based on tool schemas
   - No hardcoded parameter mapping

## Architecture Principles

1. **Tool Agnostic**: System works with ANY MCP tools, not just specific ones
2. **Schema Driven**: AI uses tool schemas to understand capabilities
3. **AI Controlled**: AI decides which tools to use and how to use them
4. **Config Driven**: Behavior controlled through environment variables and prompts
5. **Zero Assumptions**: Don't assume specific tools exist or work in specific ways

## Why This Matters

- **Flexibility**: System works with any MCP server configuration
- **Maintainability**: No tool-specific code to update when tools change
- **Scalability**: Easily add new tools without code changes
- **Reliability**: AI makes intelligent decisions based on actual tool capabilities

## Remember

**THE AI IS THE INTELLIGENCE - NOT THE CODE**

Let the AI:
- Discover available tools
- Choose appropriate tools
- Generate correct arguments
- Drive the workflow

The code should only:
- Provide generic infrastructure
- Execute AI decisions
- Remain completely tool-agnostic

## Build Command

When making changes, always run:
```bash
npm run build
```

## Testing

Test with the generic, tool-agnostic approach:
```bash
node dist/index-test.js
```

---

**If you find yourself writing tool-specific logic, STOP and refactor to be AI-driven instead.**