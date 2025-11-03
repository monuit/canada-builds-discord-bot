// MARK: - OpenAI Service
// GPT-5-nano integration for digest summarization

import OpenAI from 'openai';
import { logger } from '../utils/logger';
import { summaryCache } from './SummaryCache';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = 'gpt-5-nano';
const INPUT_COST_PER_1M = 0.15; // $0.15 per 1M input tokens
const OUTPUT_COST_PER_1M = 0.60; // $0.60 per 1M output tokens

export interface MessageForSummary {
  id: string;
  authorUsername: string;
  content: string;
  timestamp: Date;
  url: string;
}

export interface SummaryResult {
  summary: string;
  tokensUsed: {
    input: number;
    output: number;
  };
  cost: number;
}

export interface TagSuggestionPayload {
  name: string;
  confidence: number;
  rationale?: string;
}

interface TagSuggestionContext {
  threadName: string;
  participants: string[];
  messages: Array<{ id: string; author: string; content: string }>;
}

/**
 * Condense messages into token-efficient format
 */
export function condenseMessages(messages: MessageForSummary[]): string {
  return messages
    .map(msg => {
      const time = msg.timestamp.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      });
      const content = msg.content.slice(0, 100); // Limit to 100 chars
      return `${time} @${msg.authorUsername}: ${content}`;
    })
    .join('\n');
}

/**
 * Generate AI summary for a topic cluster
 * Uses 6-hour cache to reduce costs
 */
export async function generateSummary(
  messages: MessageForSummary[],
  keyword: string,
  options?: { cacheTtlHours?: number }
): Promise<SummaryResult> {
  // Check cache first
  const messageIds = messages.map(m => m.id);
  const cached = summaryCache.get(messageIds, keyword);
  
  if (cached) {
    return {
      summary: cached.summary,
      tokensUsed: cached.tokensUsed,
      cost: cached.cost,
    };
  }

  // Generate new summary
  const condensedMessages = condenseMessages(messages);
  
  const systemPrompt = `Summarize Discord messages about "${keyword}" into concise bullet points. Max 200 words. Focus on key decisions, discussions, and action items. Format as clean markdown bullets.`;

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: condensedMessages },
      ],
      max_tokens: 500,
      temperature: 0.3,
      top_p: 0.9,
      frequency_penalty: 0.2,
      presence_penalty: 0.1,
    });

    const summary = completion.choices[0]?.message?.content || 'No summary generated.';
    const inputTokens = completion.usage?.prompt_tokens || 0;
    const outputTokens = completion.usage?.completion_tokens || 0;
    
    const cost = (inputTokens / 1_000_000 * INPUT_COST_PER_1M) + 
                 (outputTokens / 1_000_000 * OUTPUT_COST_PER_1M);

    const result: SummaryResult = {
      summary,
      tokensUsed: {
        input: inputTokens,
        output: outputTokens,
      },
      cost,
    };

    // Cache the result
    const ttlMs = options?.cacheTtlHours ? options.cacheTtlHours * 60 * 60 * 1000 : undefined;
    summaryCache.set(messageIds, keyword, summary, result.tokensUsed, cost, ttlMs);

    logger.info('Generated OpenAI summary', {
      keyword,
      messageCount: messages.length,
      tokens: inputTokens + outputTokens,
      cost: cost.toFixed(4),
    });

    return result;

  } catch (error: any) {
    // Handle rate limit errors
    if (error.status === 429) {
      logger.error('OpenAI rate limit exceeded', { keyword, error: error.message });
      throw new Error('OpenAI API rate limit exceeded. Please try again later.');
    }

    // Handle quota errors
    if (error.status === 403 || error.message?.includes('quota')) {
      logger.error('OpenAI quota exceeded', { keyword, error: error.message });
      throw new Error('OpenAI API quota exceeded. Please contact administrator.');
    }

    logger.error('OpenAI API error', { keyword, error: error.message });
    throw error;
  }
}

/**
 * Calculate estimated token count for a string
 */
export function estimateTokenCount(text: string): number {
  // Rough estimate: 4 characters per token
  return Math.ceil(text.length / 4);
}

function sanitizeJSONResponse(raw: string): string {
  return raw
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
}

export async function generateTagSuggestions(
  context: TagSuggestionContext,
): Promise<TagSuggestionPayload[]> {
  const condensedMessages = context.messages
    .slice(-20)
    .map(msg => `${msg.author}: ${msg.content.slice(0, 120)}`)
    .join('\n');

  const systemPrompt = 'You are an assistant that creates concise discovery tags for Discord discussion threads. '
    + 'Return 1-5 short tags (1-3 words) in JSON with fields name, confidence (0-1 float), rationale.';

  const userPrompt = [
    `Thread: ${context.threadName}`,
    `Participants: ${context.participants.join(', ') || 'unknown'}`,
    'Messages:',
    condensedMessages || 'No recent messages captured.',
    'Return ONLY a JSON array. Example: [{"name": "ai", "confidence": 0.72, "rationale": ""}]',
  ].join('\n');

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 300,
      temperature: 0.2,
    });

    const raw = completion.choices[0]?.message?.content ?? '[]';
    const sanitized = sanitizeJSONResponse(raw);
    const parsed = JSON.parse(sanitized);

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return fallbackTags(context.threadName);
    }

    return parsed
      .slice(0, 5)
      .map((item: any): TagSuggestionPayload => ({
        name: String(item.name ?? '').toLowerCase().slice(0, 40) || 'general',
        confidence: typeof item.confidence === 'number' ? Math.min(Math.max(item.confidence, 0), 1) : 0.5,
        rationale: typeof item.rationale === 'string' ? item.rationale.slice(0, 160) : undefined,
      }));

  } catch (error: any) {
    logger.error('OpenAI tag suggestion failed', {
      threadName: context.threadName,
      error: error.message,
    });
    return fallbackTags(context.threadName);
  }
}

function fallbackTags(threadName: string): TagSuggestionPayload[] {
  const cleaned = threadName.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const primary = cleaned.slice(0, 3);

  if (primary.length === 0) {
    return [{ name: 'general', confidence: 0.3 }];
  }

  return primary.map(word => ({ name: word, confidence: 0.4 }));
}
