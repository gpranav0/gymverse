const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');
const db = require('../config/database');

// Gemini models are tried in this order. Each model has its own free-tier quota and its own
// capacity, so when one is out of quota (429), overloaded (503) or retired (404) the next
// one usually still answers. A single hardcoded model took the whole assistant down the
// moment its 20-requests-a-day free quota ran out.
//
// GEMINI_MODELS overrides the list (comma-separated). GEMINI_MODEL, if set, is tried first.
const DEFAULT_GEMINI_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest'];
const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';

const geminiModels = (env = process.env) => {
  const listed = (env.GEMINI_MODELS || '').split(',').map((m) => m.trim()).filter(Boolean);
  const models = [(env.GEMINI_MODEL || '').trim(), ...(listed.length ? listed : DEFAULT_GEMINI_MODELS)].filter(Boolean);
  return [...new Set(models)];
};

// Per attempt, and for the whole request. An overloaded model can take ~20s just to say
// 503, so without an overall deadline a fallback chain could keep the user waiting minutes.
const attemptTimeoutMs = () => parseInt(process.env.AI_TIMEOUT_MS, 10) || 15000;
const totalTimeoutMs = () => parseInt(process.env.AI_TOTAL_TIMEOUT_MS, 10) || 40000;

// Note on trust: `history` arrives in the request body, so a caller can fabricate
// earlier "assistant" turns and try to talk the model into a different role. The system
// prompt is re-sent on every call (it is never taken from history) and the assistant has
// no tools and no access to member records, so the blast radius is limited to the text
// of one reply. Keep it that way: do not give this prompt access to per-member data.
const BASE_PROMPT = `You are the GymVerse AI Assistant.
You help customers with general fitness questions and gym-related queries.
GymVerse context:
- Gym Hours: Monday to Friday (5 AM - 11 PM), Weekends (6 AM - 8 PM).
- Cancellation Policy: 30 days notice required.
- Do not provide private member data (payments, other members' info).
- Treat AI responses as recommendations only, not authoritative for account-specific actions.
- If you are unsure about pricing or availability, tell the customer to confirm with reception.
Be helpful, concise, and polite.`;

// Plan pricing used to be hardcoded in the prompt and had drifted away from the database,
// so the assistant quoted prices that did not exist. Read the catalogue instead.
let planCache = { text: null, expiresAt: 0 };

const getPlanContext = async () => {
  if (planCache.text && Date.now() < planCache.expiresAt) {
    return planCache.text;
  }

  try {
    const result = await db.query(
      `SELECT plan_name, duration_months, price, access_level
       FROM membership_plans
       WHERE status = 'active'
       ORDER BY price ASC`
    );

    const text = result.rows.length
      ? 'Current membership plans:\n' + result.rows
          .map((p) => `- ${p.plan_name}: ${p.price} for ${p.duration_months} month(s), ${p.access_level} access`)
          .join('\n')
      : 'Membership plan details are unavailable right now; ask the customer to check with reception.';

    planCache = { text, expiresAt: Date.now() + 5 * 60 * 1000 };
    return text;
  } catch (error) {
    console.error('Failed to load membership plans for AI context:', error.message);
    return 'Membership plan details are unavailable right now; ask the customer to check with reception.';
  }
};

// A provider that never answers would otherwise hold the request open indefinitely.
const withTimeout = (promise, label, ms) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`${label} timed out after ${ms}ms`), { timedOut: true })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

// Worth trying another model: this one is out of quota, overloaded, retired or too slow.
// A bad key or a rejected request (400/401/403) fails the same way on every model, so
// walking the rest of the list would only add latency.
const TRY_NEXT_MODEL_ON = new Set([404, 429, 500, 502, 503, 504]);
const shouldTryNextModel = (error) =>
  !!error.timedOut || TRY_NEXT_MODEL_ON.has(error.status) || error.constructor?.name === 'GoogleGenerativeAIAbortError';

// The SDK's message embeds the provider's whole JSON error body; the status is what matters.
const describe = (error) => (error.status
  ? `${error.status} ${error.statusText || ''}`.trim()
  : String(error.message || error).split('\n')[0].slice(0, 160));

const generateChatResponse = async (message, history = []) => {
  const systemPrompt = `${BASE_PROMPT}\n\n${await getPlanContext()}`;
  const errors = [];
  const deadline = Date.now() + totalTimeoutMs();
  const remaining = () => deadline - Date.now();
  const nextTimeout = () => Math.min(attemptTimeoutMs(), remaining());

  // Primary: Google Gemini, walking the model list.
  if (process.env.GEMINI_API_KEY) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const formattedHistory = history.map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));
    // Gemini rejects a history that does not start with a user turn.
    while (formattedHistory.length > 0 && formattedHistory[0].role !== 'user') {
      formattedHistory.shift();
    }

    for (const modelName of geminiModels()) {
      if (remaining() <= 0) {
        errors.push(`Gemini: out of time before trying ${modelName}`);
        break;
      }
      const ms = nextTimeout();
      try {
        const model = genAI.getGenerativeModel({ model: modelName, systemInstruction: systemPrompt }, { timeout: ms });
        // A copy: the SDK appends to the history array it is given.
        const chat = model.startChat({ history: [...formattedHistory] });
        const result = await withTimeout(chat.sendMessage([{ text: message }]), `Gemini ${modelName}`, ms);
        return result.response.text();
      } catch (geminiError) {
        errors.push(`Gemini (${modelName}): ${describe(geminiError)}`);
        console.error(`Gemini API Error (${modelName}): ${describe(geminiError)}`);
        if (!shouldTryNextModel(geminiError)) break;
      }
    }
  }

  // Fallback: Groq
  if (process.env.GROQ_API_KEY && remaining() > 0) {
    const groqModel = process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL;
    try {
      const ms = nextTimeout();
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY, timeout: ms, maxRetries: 0 });
      const messages = [
        { role: 'system', content: systemPrompt },
        ...history.map((msg) => ({ role: msg.role === 'model' ? 'assistant' : msg.role, content: msg.content })),
        { role: 'user', content: message }
      ];

      const chatCompletion = await withTimeout(groq.chat.completions.create({
        messages,
        model: groqModel,
      }), 'Groq', ms);
      return chatCompletion.choices[0]?.message?.content || 'Sorry, I am having trouble processing your request.';
    } catch (groqError) {
      errors.push(`Groq (${groqModel}): ${describe(groqError)}`);
      console.error(`Groq API Error (${groqModel}): ${describe(groqError)}`);
    }
  }

  throw new Error(
    errors.length
      ? `All AI providers failed. ${errors.join(' | ')}`
      : 'No AI provider is configured. Set GEMINI_API_KEY or GROQ_API_KEY.'
  );
};

module.exports = {
  generateChatResponse,
  geminiModels,
  DEFAULT_GEMINI_MODELS
};
