import { Request, Response } from 'express';

/**
 * Chat Controller
 * Handles AI chat interactions for candidate research assistance
 */

// In-memory conversation storage (consider moving to database for persistence)
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface ConversationHistory {
  [sessionId: string]: ChatMessage[];
}

const conversations: ConversationHistory = {};

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

    // Get conversation context (last 10 messages for context window)
    const conversationContext = conversations[sessionId].slice(-10);

    // =========================================================================
    // TODO: INTEGRATE GEMINI API HERE
    // =========================================================================
    // 1. Set up your Gemini API key in environment variables (.env file):
    //    GEMINI_API_KEY=your_api_key_here
    //
    // 2. Install the Gemini SDK:
    //    npm install @google/generative-ai
    //
    // 3. Replace the mock response below with actual Gemini API call:
    //
    // import { GoogleGenerativeAI } from '@google/generative-ai';
    //
    // const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    // const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    //
    // // Build conversation context for Gemini
    // const chatHistory = conversationContext.map(msg => ({
    //   role: msg.role === 'user' ? 'user' : 'model',
    //   parts: [{ text: msg.content }]
    // }));
    //
    // const chat = model.startChat({
    //   history: chatHistory.slice(0, -1), // Exclude the latest message
    //   generationConfig: {
    //     maxOutputTokens: 1000,
    //     temperature: 0.7,
    //   },
    // });
    //
    // const result = await chat.sendMessage(message);
    // const aiResponse = result.response.text();
    //
    // =========================================================================

    // MOCK RESPONSE - Replace this with actual Gemini API response
    const aiResponse = generateMockResponse(message, conversationContext);

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

/**
 * Mock response generator
 * This simulates an AI response and should be replaced with actual Gemini API
 */
function generateMockResponse(message: string, context: ChatMessage[]): string {
  const lowerMessage = message.toLowerCase();

  // Context-aware responses based on keywords
  if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
    return "Hello! I'm your AI assistant for researching candidates in the 2026 midterm elections. I can help you learn about candidates' positions, campaign finances, voting records, and more. What would you like to know?";
  }

  if (lowerMessage.includes('senate') || lowerMessage.includes('senator')) {
    return "I can help you research Senate candidates for the 2026 midterms. You can ask me about specific candidates, compare their positions on issues, check their campaign finance data, or learn about Senate races in particular states. What would you like to know?";
  }

  if (lowerMessage.includes('house') || lowerMessage.includes('representative')) {
    return "I can provide information about House of Representatives candidates in the 2026 midterms. You can ask about candidates in specific districts, their policy positions, voting records, or campaign funding. How can I assist you with House races?";
  }

  if (lowerMessage.includes('finance') || lowerMessage.includes('funding') || lowerMessage.includes('money') || lowerMessage.includes('donation')) {
    return "Campaign finance is an important aspect of elections. I can help you understand where candidates get their funding, including individual donations, PAC contributions, and overall fundraising totals. Which candidate's finances would you like to explore?";
  }

  if (lowerMessage.includes('state') || lowerMessage.includes('where')) {
    return "I can provide information about elections in all 50 states for the 2026 midterms. Which state are you interested in learning about? I can tell you about Senate races, House districts, and key candidates in that state.";
  }

  if (lowerMessage.includes('how') && lowerMessage.includes('vote')) {
    return "I can help you understand the voting process! This includes voter registration deadlines, polling locations, absentee ballot requirements, and early voting options. Which state are you voting in, or what specific aspect of voting would you like to know about?";
  }

  if (lowerMessage.includes('compare')) {
    return "I can help you compare candidates side-by-side on various factors including their policy positions, voting records, campaign finances, endorsements, and backgrounds. Which candidates would you like to compare?";
  }

  // Default response
  return "I'm here to help you research candidates for the 2026 midterm elections. You can ask me about:\n\n• Specific candidates and their positions\n• Campaign finance and funding sources\n• Senate and House races in any state\n• Voter registration and election information\n• Comparing candidates side-by-side\n\nWhat would you like to know? (Note: I'm currently using mock responses. Once the Gemini API is integrated, I'll provide more detailed and accurate information!)";
}
