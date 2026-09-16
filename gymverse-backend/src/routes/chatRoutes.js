const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const chatController = require('../controllers/chatController');
const { requireAuth } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validationMiddleware');
const { chatValidator } = require('../validators/resourceValidators');

// This endpoint spends real money on every call, against the gym's own Gemini/Groq
// account. It used to be reachable with no credentials at all, which made it a free
// public LLM proxy that anyone could bill to this deployment. Authentication first,
// then a per-user budget.
const chatRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Keyed on the account rather than the IP: an IP is shared by everyone behind the
  // gym's NAT and trivially rotated by an attacker, so it is the wrong unit for a
  // spending limit.
  keyGenerator: (req) => `user:${req.user.user_id}`,
  message: {
    success: false,
    message: 'Too many chat requests. Please try again in a few minutes.'
  }
});

router.use(requireAuth);
router.get('/status', chatController.getStatus);
router.get('/conversations', chatController.listConversations);
router.get('/conversations/:id', param('id').isUUID(), query('before').optional().isMongoId(), validate, chatController.getConversation);
router.post('/', chatRateLimiter, chatValidator,
  body('conversationId').optional().isUUID(),
  body('requestId').optional().isUUID(),
  body('gapBefore').optional().isBoolean({ strict: true }),
  validate, chatController.handleChatRequest);

module.exports = router;
