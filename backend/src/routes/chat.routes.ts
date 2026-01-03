import { Router } from 'express';
import { sendMessage, clearConversation } from '../controllers/chat.controller.js';

const router = Router();

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
router.post('/', sendMessage);

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
