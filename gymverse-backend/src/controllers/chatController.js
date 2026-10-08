const { randomUUID, createHash } = require('crypto');
const NodeCache = require('node-cache');
const { generateChatResponse } = require('../services/aiService');
const history = require('../services/chatHistoryService');
const { getAccountContext } = require('../services/accountContextService');
const chatCache = new NodeCache({ stdTTL: 600, checkperiod: 120, maxKeys: 500, useClones: false });

exports.handleChatRequest = async (req, res) => {
  const eligible = history.ticket();
  const startedAt = new Date();
  const { message, conversationHistory = [], gapBefore = false, temporary = false } = req.body;
  const conversationId = req.body.conversationId || randomUUID();
  const requestId = req.body.requestId || randomUUID();
  try {
    const accountContext = await getAccountContext(req.user.user_id);
    // Scope personalized replies to the account and the current retrieved facts.
    //
    // A temporary chat is the user asking for nothing to be kept, so it bypasses this cache
    // in both directions: a cached copy would outlive the conversation by ten minutes.
    const normalized = message.trim().toLowerCase();
    // Fetch fresh context before cache lookup; profile changes must invalidate old answers.
    const contextHash = createHash('sha256').update(JSON.stringify(accountContext)).digest('hex');
    const cacheKey = `${req.user.user_id}:${contextHash}:${normalized}`;
    const cacheable = accountContext.status !== 'unavailable' && !temporary && conversationHistory.length === 0 && normalized.length <= 200;
    let response = cacheable ? chatCache.get(cacheKey) : null;
    const source = response ? 'cache' : 'ai';
    if (!response) response = await generateChatResponse(message, conversationHistory, accountContext);
    if (cacheable) { try { chatCache.set(cacheKey, response); } catch { /* Cache full. */ } }
    let persistence;
    if (temporary) {
      // Enforced here rather than trusted to the browser: a temporary request is never
      // written, even with history connected and a valid save ticket in hand.
      persistence = { saved: false, temporary: true, ...history.status() };
    } else {
      // Only the current exchange is sent to MongoDB, never conversationHistory.
      // Driver operation deadlines bound this write; a failure cannot discard the AI reply.
      try {
        persistence = await history.save({ userId: req.user.user_id, conversationId, requestId,
          message, response, gapBefore, startedAt, eligible,
          grounding: {
            accountContextAvailable: accountContext.status === 'available',
            healthContextProvided: !!accountContext.data?.profile?.health_conditions,
          } });
      } catch { persistence = { saved: false, available: false }; }
    }
    res.json({ success: true, response, source, conversationId, requestId, persistence });
  } catch {
    res.status(503).json({ success: false, message: 'The assistant is temporarily unavailable. Please try again shortly.' });
  }
};
exports.getStatus = (req, res) => res.json({ success: true, ...history.status() });
exports.listConversations = async (req, res) => res.json({ success: true, ...await history.list(req.user.user_id) });
exports.getConversation = async (req, res) => {
  const result = await history.read(req.user.user_id, req.params.id, req.query.before);
  if (result.missing) return res.status(404).json({ success: false, message: 'Conversation not found' });
  res.json({ success: true, ...result });
};
exports.chatCache = chatCache;
