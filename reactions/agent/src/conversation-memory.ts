import { v4 as uuidv4 } from 'uuid';

export interface ConversationEntry {
  id: string;
  timestamp: Date;
  input: string;
  output: string;
}

export interface QueryConversation {
  queryId: string;
  entries: ConversationEntry[];
  lastActivity: Date;
}

export class ConversationMemory {
  private conversations: Map<string, QueryConversation> = new Map();
  private maxHistorySize: number;
  private ttlHours: number;
  private cleanupInterval: NodeJS.Timeout;

  constructor(maxHistorySize: number = 50, ttlHours: number = 24) {
    this.maxHistorySize = maxHistorySize;
    this.ttlHours = ttlHours;
    
    // Start cleanup interval (every hour)
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 60 * 1000);
  }

  addInteraction(queryId: string, input: string, output: string): void {
    const conversation = this.getOrCreateConversation(queryId);
    
    const entry: ConversationEntry = {
      id: uuidv4(),
      timestamp: new Date(),
      input,
      output,
    };

    conversation.entries.push(entry);
    conversation.lastActivity = new Date();

    // Trim history if it exceeds max size
    if (conversation.entries.length > this.maxHistorySize) {
      conversation.entries = conversation.entries.slice(-this.maxHistorySize);
    }

    this.conversations.set(queryId, conversation);
  }

  getHistory(queryId: string, limit?: number): string {
    const conversation = this.conversations.get(queryId);
    if (!conversation || conversation.entries.length === 0) {
      return 'No previous conversation history.';
    }

    const entries = limit 
      ? conversation.entries.slice(-limit)
      : conversation.entries;

    return entries
      .map((entry, index) => {
        const timestamp = entry.timestamp.toISOString();
        return `--- Interaction ${index + 1} (${timestamp}) ---
Human: ${this.truncateText(entry.input, 200)}
Assistant: ${this.truncateText(entry.output, 200)}`;
      })
      .join('\n\n');
  }

  getConversationSummary(queryId: string): string {
    const conversation = this.conversations.get(queryId);
    if (!conversation) {
      return `No conversation found for query: ${queryId}`;
    }

    const entryCount = conversation.entries.length;
    const lastActivity = conversation.lastActivity.toISOString();
    
    return `Query: ${queryId}
Interactions: ${entryCount}
Last Activity: ${lastActivity}
History Size: ${entryCount}/${this.maxHistorySize}`;
  }

  clearHistory(queryId: string): void {
    this.conversations.delete(queryId);
  }

  getAllQueryIds(): string[] {
    return Array.from(this.conversations.keys());
  }

  cleanup(): void {
    const now = new Date();
    const ttlMs = this.ttlHours * 60 * 60 * 1000;
    const deletedQueries: string[] = [];

    const queryIds = Array.from(this.conversations.keys());
    for (const queryId of queryIds) {
      const conversation = this.conversations.get(queryId)!;
      const timeSinceLastActivity = now.getTime() - conversation.lastActivity.getTime();
      
      if (timeSinceLastActivity > ttlMs) {
        this.conversations.delete(queryId);
        deletedQueries.push(queryId);
      }
    }

    if (deletedQueries.length > 0) {
      console.log(`Cleaned up conversation history for ${deletedQueries.length} queries: ${deletedQueries.join(', ')}`);
    }
  }

  getStats(): {
    totalConversations: number;
    totalInteractions: number;
    oldestConversation: Date | null;
    newestConversation: Date | null;
  } {
    const conversationKeys = Array.from(this.conversations.keys());
    const conversations = conversationKeys.map(key => this.conversations.get(key)!);
    const totalInteractions = conversations.reduce((sum, conv) => sum + conv.entries.length, 0);
    
    const dates = conversations
      .map(conv => conv.lastActivity)
      .sort((a, b) => a.getTime() - b.getTime());

    return {
      totalConversations: conversations.length,
      totalInteractions,
      oldestConversation: dates[0] || null,
      newestConversation: dates[dates.length - 1] || null,
    };
  }

  private getOrCreateConversation(queryId: string): QueryConversation {
    let conversation = this.conversations.get(queryId);
    
    if (!conversation) {
      conversation = {
        queryId,
        entries: [],
        lastActivity: new Date(),
      };
    }
    
    return conversation;
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength) + '...';
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.conversations.clear();
  }
}