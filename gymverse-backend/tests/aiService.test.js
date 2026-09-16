// jest.config sets resetMocks, which wipes jest.fn() implementations before every test. The
// module factories therefore use plain functions that delegate to mocks configured in beforeEach.
jest.mock('../src/config/database', () => ({ query: async () => ({ rows: [] }) }));

const mockSendMessage = jest.fn();
const mockGetGenerativeModel = jest.fn();
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: function GoogleGenerativeAI() {
    return { getGenerativeModel: (...args) => mockGetGenerativeModel(...args) };
  },
}));

const mockGroqCreate = jest.fn();
jest.mock('groq-sdk', () => function Groq() {
  return { chat: { completions: { create: (...args) => mockGroqCreate(...args) } } };
});

const { generateChatResponse, geminiModels, DEFAULT_GEMINI_MODELS } = require('../src/services/aiService');

const KEYS = ['GEMINI_API_KEY', 'GEMINI_MODEL', 'GEMINI_MODELS', 'GROQ_API_KEY', 'AI_TIMEOUT_MS', 'AI_TOTAL_TIMEOUT_MS'];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

const httpError = (status) => Object.assign(new Error(`[${status}] provider said no`), { status });
const reply = (text) => ({ response: { text: () => text } });
const triedModels = () => mockGetGenerativeModel.mock.calls.map((call) => call[0].model);
const hang = () => new Promise(() => {});

beforeEach(() => {
  KEYS.forEach((k) => delete process.env[k]);
  process.env.GEMINI_API_KEY = 'test-key';
  process.env.GEMINI_MODELS = 'model-a,model-b,model-c';
  mockSendMessage.mockReset();
  mockGetGenerativeModel.mockReset();
  mockGetGenerativeModel.mockImplementation(() => ({ startChat: () => ({ sendMessage: mockSendMessage }) }));
  mockGroqCreate.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => console.error.mockRestore());

afterAll(() => KEYS.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]))));

test('a model out of quota or overloaded falls through to the next one', async () => {
  mockSendMessage
    .mockRejectedValueOnce(httpError(429))
    .mockRejectedValueOnce(httpError(503))
    .mockResolvedValueOnce(reply('third time lucky'));

  await expect(generateChatResponse('hi')).resolves.toBe('third time lucky');
  expect(triedModels()).toEqual(['model-a', 'model-b', 'model-c']);
});

test('a retired model (404) is skipped', async () => {
  mockSendMessage.mockRejectedValueOnce(httpError(404)).mockResolvedValueOnce(reply('ok'));
  await expect(generateChatResponse('hi')).resolves.toBe('ok');
  expect(triedModels()).toEqual(['model-a', 'model-b']);
});

test('a bad key is not retried on every model', async () => {
  mockSendMessage.mockRejectedValue(httpError(403));
  await expect(generateChatResponse('hi')).rejects.toThrow(/All AI providers failed.*model-a.*403/);
  expect(triedModels()).toEqual(['model-a']);
});

test('GEMINI_MODEL is tried first and duplicates are dropped', () => {
  expect(geminiModels({ GEMINI_MODEL: 'model-b', GEMINI_MODELS: 'model-a, model-b' })).toEqual(['model-b', 'model-a']);
  expect(geminiModels({})).toEqual(DEFAULT_GEMINI_MODELS);
});

test('Groq answers when every Gemini model fails', async () => {
  process.env.GROQ_API_KEY = 'groq-key';
  mockSendMessage.mockRejectedValue(httpError(503));
  mockGroqCreate.mockResolvedValue({ choices: [{ message: { content: 'groq reply' } }] });

  await expect(generateChatResponse('hi')).resolves.toBe('groq reply');
  expect(triedModels()).toEqual(['model-a', 'model-b', 'model-c']);
});

test('a model that hangs times out and the next one is tried', async () => {
  process.env.AI_TIMEOUT_MS = '50';
  mockSendMessage.mockImplementationOnce(hang).mockResolvedValueOnce(reply('fast model'));
  await expect(generateChatResponse('hi')).resolves.toBe('fast model');
  expect(triedModels()).toEqual(['model-a', 'model-b']);
});

test('no new attempt starts once the overall deadline has passed', async () => {
  process.env.AI_TIMEOUT_MS = '60';
  process.env.AI_TOTAL_TIMEOUT_MS = '100';
  mockSendMessage.mockImplementation(hang);
  await expect(generateChatResponse('hi')).rejects.toThrow(/out of time/);
  expect(triedModels()).toEqual(['model-a', 'model-b']);
});

test('the leading assistant greeting is not sent to Gemini as history', async () => {
  const startChat = jest.fn(() => ({ sendMessage: mockSendMessage }));
  mockGetGenerativeModel.mockImplementationOnce(() => ({ startChat }));
  mockSendMessage.mockResolvedValueOnce(reply('ok'));
  await generateChatResponse('next', [{ role: 'model', content: 'Welcome!' }, { role: 'user', content: 'first' }, { role: 'model', content: 'answer' }]);
  expect(startChat.mock.calls[0][0].history.map((h) => h.role)).toEqual(['user', 'model']);
});
