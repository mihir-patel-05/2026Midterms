import { Request, Response } from 'express';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { env } from '../config/env.js';

/**
 * Chat Controller
 * Handles AI chat interactions for candidate research assistance
 */

/**
 * In-memory conversation storage
 *
 * LIMITATIONS:
 * - Lost on server restart/deployment
 * - Not shared across multiple server instances
 *
 * Bounded so anonymous clients cannot grow it without limit: at most
 * MAX_SESSIONS sessions (oldest evicted first), each idle for at most
 * SESSION_TTL_MS, keeping the last MAX_HISTORY messages.
 */
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const MAX_SESSIONS = 5000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_HISTORY = 20;
const MAX_MESSAGE_LENGTH = 4000;
// Client-generated, unguessable IDs (the web app uses crypto.randomUUID()).
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{16,100}$/;

const conversations = new Map<string, { messages: ChatMessage[]; lastUsed: number }>();

function getConversation(sessionId: string): ChatMessage[] {
  const now = Date.now();
  const existing = conversations.get(sessionId);
  if (existing && now - existing.lastUsed < SESSION_TTL_MS) {
    // Re-insert so Map order tracks recency and eviction drops the least recently used.
    conversations.delete(sessionId);
    existing.lastUsed = now;
    conversations.set(sessionId, existing);
    return existing.messages;
  }
  conversations.delete(sessionId);
  while (conversations.size >= MAX_SESSIONS) {
    conversations.delete(conversations.keys().next().value!);
  }
  const created = { messages: [] as ChatMessage[], lastUsed: now };
  conversations.set(sessionId, created);
  return created.messages;
}

// Initialize Gemini AI client (singleton pattern)
// Using gemini-1.5-flash for faster responses and lower costs
// Alternative: "gemini-1.5-pro" for more complex reasoning tasks
const model: GenerativeModel | null = env.GEMINI_API_KEY ? new GoogleGenerativeAI(env.GEMINI_API_KEY).getGenerativeModel({
  model: "gemini-1.5-flash",
  generationConfig: {
    maxOutputTokens: 2000, // Increased from 1000 for more comprehensive responses
    temperature: 0.7, // Balance between creativity and consistency
  },
}) : null;

// NOTE: For streaming responses, use model.generateContentStream() instead
// This would provide a better UX for long responses but requires frontend changes

/**
 * Send a chat message and get AI response
 * POST /api/chat
 */
export const sendMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!model) {
      res.status(503).json({ error: 'Service Unavailable', message: 'AI chat is not configured' });
      return;
    }
    const { message, sessionId } = req.body;

    // Validate input
    if (!message || typeof message !== 'string' || message.trim() === '') {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Message content is required and must be a non-empty string',
      });
      return;
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      res.status(400).json({
        error: 'Bad Request',
        message: `Message must be at most ${MAX_MESSAGE_LENGTH} characters`,
      });
      return;
    }

    if (typeof sessionId !== 'string' || !SESSION_ID_PATTERN.test(sessionId)) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'A valid session ID is required',
      });
      return;
    }

    const history = getConversation(sessionId);

    // Add user message to conversation history
    const userMessage: ChatMessage = {
      role: 'user',
      content: message.trim(),
      timestamp: new Date().toISOString(),
    };
    history.push(userMessage);

    // Get conversation context (last 10 messages for context window, excluding current message)
    const conversationContext = history.slice(-11, -1); // Get previous 10 messages

    // Build chat history for Gemini (excluding the current user message)
    const chatHistory = conversationContext.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    // Start chat with history and send the new message
    const chat = model.startChat({
      history: chatHistory,
    });

    const result = await chat.sendMessage(message);
    const aiResponse = result.response.text();

    // Add AI response to conversation history
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date().toISOString(),
    };
    history.push(assistantMessage);
    if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);

    // Return response
    res.json({
      message: aiResponse,
      timestamp: assistantMessage.timestamp,
      sessionId,
    });

  } catch (error) {
    console.error('Error in chat controller:', error);

    // Handle specific Gemini API errors
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();

      // Rate limit or quota exceeded
      if (errorMessage.includes('quota') || errorMessage.includes('rate limit')) {
        res.status(429).json({
          error: 'Rate Limit Exceeded',
          message: 'AI service quota exceeded. Please try again later.',
        });
        return;
      }

      // Invalid API key
      if (errorMessage.includes('api key') || errorMessage.includes('unauthorized')) {
        res.status(500).json({
          error: 'Configuration Error',
          message: 'AI service configuration error. Please contact support.',
        });
        return;
      }

      // Content filtering or safety issues
      if (errorMessage.includes('safety') || errorMessage.includes('blocked')) {
        res.status(400).json({
          error: 'Content Filtered',
          message: 'Your message was blocked by content safety filters. Please rephrase your question.',
        });
        return;
      }

      // Model overloaded or unavailable
      if (errorMessage.includes('overloaded') || errorMessage.includes('unavailable')) {
        res.status(503).json({
          error: 'Service Unavailable',
          message: 'AI service is temporarily unavailable. Please try again in a moment.',
        });
        return;
      }
    }

    // Generic error fallback
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to process chat message. Please try again.',
    });
  }
};

/**
 * Clear conversation history for a session
 * DELETE /api/chat/:sessionId
 */
export const clearConversation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;

    if (!SESSION_ID_PATTERN.test(sessionId)) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'A valid session ID is required',
      });
      return;
    }

    // Clear conversation history
    conversations.delete(sessionId);

    res.json({
      message: 'Conversation history cleared successfully',
      sessionId,
    });

  } catch (error) {
    console.error('Error clearing conversation:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to clear conversation history',
    });
  }
};
