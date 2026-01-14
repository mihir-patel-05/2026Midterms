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
 * - No cleanup for old sessions (potential memory leak)
 *
 * RECOMMENDATIONS:
 * - Move to Redis for distributed caching with TTL
 * - Or move to database (Prisma) for persistence
 * - Add session cleanup for sessions older than 24 hours
 */
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface ConversationHistory {
  [sessionId: string]: ChatMessage[];
}

const conversations: ConversationHistory = {};

// Initialize Gemini AI client (singleton pattern)
// Using gemini-1.5-flash for faster responses and lower costs
// Alternative: "gemini-1.5-pro" for more complex reasoning tasks
const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
const model: GenerativeModel = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
  generationConfig: {
    maxOutputTokens: 2000, // Increased from 1000 for more comprehensive responses
    temperature: 0.7, // Balance between creativity and consistency
  },
});

// NOTE: For streaming responses, use model.generateContentStream() instead
// This would provide a better UX for long responses but requires frontend changes

/**
 * Send a chat message and get AI response
 * POST /api/chat
 */
export const sendMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { message, sessionId } = req.body;

    // Validate input
    if (!message || typeof message !== 'string' || message.trim() === '') {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Message content is required and must be a non-empty string',
      });
      return;
    }

    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Session ID is required',
      });
      return;
    }

    // Initialize conversation history for new sessions
    if (!conversations[sessionId]) {
      conversations[sessionId] = [];
    }

    // Add user message to conversation history
    const userMessage: ChatMessage = {
      role: 'user',
      content: message.trim(),
      timestamp: new Date().toISOString(),
    };
    conversations[sessionId].push(userMessage);

    // Get conversation context (last 10 messages for context window, excluding current message)
    const conversationContext = conversations[sessionId].slice(-11, -1); // Get previous 10 messages

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
    conversations[sessionId].push(assistantMessage);

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

    if (!sessionId) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Session ID is required',
      });
      return;
    }

    // Clear conversation history
    delete conversations[sessionId];

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
