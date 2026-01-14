import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { sendMessage, clearConversation } from '../controllers/chat.controller.js';

const router = Router();

// Rate limiter for chat endpoint - 20 requests per minute per IP
const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // limit each IP to 20 requests per minute
  message: {
    error: 'Too Many Requests',
    message: 'Too many chat requests. Please wait a moment before trying again.',
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

/**
 * POST /api/chat
 * Send a message and receive AI response
 *
 * Request body:
 * {
 *   "message": "What are the Senate races in California?",
 *   "sessionId": "unique-session-id-123"
 * }
 *
 * Response:
 * {
 *   "message": "AI response text...",
 *   "timestamp": "2026-01-02T12:00:00.000Z",
 *   "sessionId": "unique-session-id-123"
 * }
 */
router.post('/', chatLimiter, sendMessage);

/**
 * DELETE /api/chat/:sessionId
 * Clear conversation history for a session
 *
 * Response:
 * {
 *   "message": "Conversation history cleared successfully",
 *   "sessionId": "unique-session-id-123"
 * }
 */
router.delete('/:sessionId', clearConversation);

export default router;
