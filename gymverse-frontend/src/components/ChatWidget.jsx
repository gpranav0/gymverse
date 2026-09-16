import { useState, useRef, useEffect } from 'react';
import { MessageSquare, MessageSquareDashed, Sparkles, X, Send, Loader2 } from 'lucide-react';
import api, { getErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import ConversationPicker from './ConversationPicker';

// The backend caps conversationHistory at 20 turns, because each one is re-sent to the
// model and paid for. Send the most recent turns rather than the whole transcript.
const MAX_HISTORY_TURNS = 20;

const WELCOME = 'Hi! I am the GymVerse AI Assistant. How can I help you today?';
const TEMPORARY_WELCOME = 'This is a temporary chat. Nothing here is saved to your history, and it disappears when you reload, start a new chat, or sign out.';
// `local` marks text the widget wrote itself (greetings, error notes). The model never said
// it, so it is never sent back as conversation history.
const greeting = (temporary) => [{ role: 'model', content: temporary ? TEMPORARY_WELCOME : WELCOME, local: true }];

export default function ChatWidget() {
  const { isAuthenticated, user, token } = useAuth();
  // A new token/account gets a fresh component, with no previous user's memory.
  if (!isAuthenticated || !user) return null;
  return <AccountChat key={`${user.user_id}:${token}`} />;
}

function AccountChat() {
  const [isOpen, setIsOpen] = useState(false);
  // Chosen by the user. Unlike an outage, nothing in this mode is ever sent for saving.
  const [temporary, setTemporary] = useState(false);
  const [messages, setMessages] = useState(() => greeting(false));
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const [conversationId, setConversationId] = useState(() => crypto.randomUUID());
  const [available, setAvailable] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [historyError, setHistoryError] = useState('');
  const alive = useRef(false);
  const abort = useRef(null);
  const busy = useRef(false);
  const gap = useRef(false);

  useEffect(() => {
    alive.current = true;
    abort.current = new AbortController();
    return () => { alive.current = false; abort.current.abort(); };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    let active = true;
    const refresh = async () => {
      try {
        const { data } = await api.get('/chat/conversations', { signal: controller.signal });
        if (!active) return;
        setAvailable(data.available);
        setConversations(data.available ? data.conversations : []);
      } catch { if (active) setAvailable(false); }
    };
    void refresh();
    const timer = setInterval(refresh, 10000);
    return () => { active = false; controller.abort(); clearInterval(timer); };
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const toggleChat = () => setIsOpen(!isOpen);
  const startConversation = (asTemporary) => {
    setConversationId(crypto.randomUUID());
    setMessages(greeting(asTemporary));
    setInputValue(''); setNextCursor(null); setHistoryError(''); gap.current = false;
  };
  const newChat = () => {
    if (busy.current) return;
    startConversation(temporary);
  };
  // Switching modes always starts a fresh conversation, in either direction, so temporary
  // messages can never be continued inside a saved conversation, nor saved ones inside a
  // temporary chat.
  const toggleTemporary = () => {
    if (busy.current) return;
    const next = !temporary;
    setTemporary(next);
    startConversation(next);
  };
  const loadHistory = async (id, before) => {
    if (!id || busy.current) return;
    busy.current = true; setIsLoading(true); setHistoryError('');
    try {
      const { data } = await api.get(`/chat/conversations/${id}`, {
        params: before ? { before } : undefined, signal: abort.current.signal,
      });
      if (!alive.current) return;
      setAvailable(data.available);
      if (!data.available) { setHistoryError('Saved history is temporarily unavailable. Your current chat is still here.'); return; }
      setMessages(previous => before ? [...data.messages, ...previous] : data.messages);
      // Opening a saved conversation means continuing it, which means saving to it.
      setConversationId(id); setNextCursor(data.nextCursor); setTemporary(false); gap.current = false;
    } catch (error) {
      if (alive.current) setHistoryError(getErrorMessage(error, 'Could not load saved history.'));
    } finally { if (alive.current) { busy.current = false; setIsLoading(false); } }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputValue.trim() || busy.current) return;
    busy.current = true;
    const requestId = crypto.randomUUID();
    const userMessage = inputValue.trim();
    const newMessages = [...messages, { role: 'user', content: userMessage, id: requestId }];
    setInputValue(''); setMessages(newMessages); setIsLoading(true);
    try {
      const { data } = await api.post('/chat', {
        message: userMessage, conversationId, requestId, gapBefore: gap.current, temporary,
        conversationHistory: messages.filter(msg => msg.role !== 'gap' && !msg.local)
          .slice(-MAX_HISTORY_TURNS).map(({ role, content }) => ({ role, content })),
      }, { signal: abort.current.signal });
      if (!alive.current) return;
      if (!data.success) throw new Error(data.message || 'Failed to get response');
      const saved = !!data.persistence?.saved;
      gap.current = !saved;
      setAvailable(!!data.persistence?.available);
      setMessages([...newMessages.map(msg => msg.id === requestId ? { ...msg, temporary: !saved } : msg),
        { role: 'model', content: data.response, temporary: !saved }]);
      if (saved) setConversations(previous => [{ id: conversationId, title: userMessage.slice(0, 70) },
        ...previous.filter(item => item.id !== conversationId)].slice(0, 50));
    } catch (error) {
      if (!alive.current) return;
      gap.current = true;
      // The server says why (rate limit, provider outage); only a network failure has no reply.
      const content = error?.response?.data?.message
        || 'I am temporarily unavailable, please contact reception for assistance.';
      setMessages([...newMessages.map(msg => msg.id === requestId ? { ...msg, temporary: true } : msg),
        { role: 'model', content, temporary: true, local: true }]);
    } finally { if (alive.current) { busy.current = false; setIsLoading(false); } }
  };

  return (
    <div className="fixed bottom-4 right-4 z-40 text-ink sm:bottom-6 sm:right-6">
      {/* Chat Button */}
      {!isOpen && (
        <button
          onClick={toggleChat}
          className="btn-primary flex items-center gap-2.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          aria-label="Open chat"
          aria-expanded={false}
          aria-controls="gymverse-chat"
        >
          <MessageSquare size={20} />
          <span className="font-display text-sm">Ask GymVerse</span>
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <section
          id="gymverse-chat"
          aria-labelledby="gymverse-chat-title"
          className="glass flex h-[520px] max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] flex-col overflow-hidden sm:w-[380px]"
          style={{
            background: 'linear-gradient(155deg, rgb(22 32 53 / .97), rgb(7 10 20 / .95))',
            animation: 'var(--animate-rise-in)',
          }}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center gap-3 border-b border-white/10 px-5 py-4">
            <div
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/15"
              style={{ background: 'linear-gradient(150deg, var(--gv-accent), #7c5cff)', boxShadow: '0 8px 22px -8px var(--gv-accent)' }}
            >
              <Sparkles size={19} className="text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="gymverse-chat-title" className="m-0 font-display text-[17px] font-semibold tracking-[-.2px]">GymVerse Assistant</h2>
              <p className="mt-0.5 text-xs text-ink-muted">Your gym & fitness companion</p>
            </div>
            <button
              type="button"
              onClick={toggleTemporary}
              disabled={isLoading}
              aria-pressed={temporary}
              aria-label="Temporary chat"
              title={temporary ? 'Turn off temporary chat' : 'Start a temporary chat — nothing is saved'}
              className={`rounded-lg p-2 transition-colors focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40 ${
                temporary ? 'text-violet' : 'text-ink-muted hover:bg-white/8 hover:text-ink'
              }`}
              style={temporary ? {
                background: 'color-mix(in oklab, var(--color-violet) 18%, transparent)',
                boxShadow: 'inset 0 0 0 1px color-mix(in oklab, var(--color-violet) 40%, transparent)',
              } : undefined}
            >
              <MessageSquareDashed className="h-5 w-5" />
            </button>
            <button
              onClick={toggleChat}
              className="rounded-lg p-2 text-ink-muted transition-colors hover:bg-white/8 hover:text-ink focus-visible:outline-2 focus-visible:outline-primary"
              aria-label="Close chat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="shrink-0 space-y-2 border-b border-white/10 px-4 py-3">
            {temporary ? (
              <p role="status" className="flex items-center gap-1.5 text-xs text-violet">
                <MessageSquareDashed size={13} aria-hidden="true" className="shrink-0" />
                Temporary chat — this conversation won’t be saved
              </p>
            ) : (
              <p role="status" className={`text-xs ${available ? 'text-ink-muted' : 'text-warn'}`}>
                {available ? 'History connected — new messages will be saved' : 'Temporary chat — history isn’t being saved'}
              </p>
            )}
            {!temporary && messages.some(msg => msg.temporary) && <p className="text-xs text-ink-muted">Temporary messages in this chat won’t appear in saved history.</p>}
            <div className="flex gap-2">
              <ConversationPicker conversations={conversations} disabled={!available || isLoading}
                onSelect={id => loadHistory(id)} />
              <button type="button" className="btn-ghost text-xs" onClick={newChat} disabled={isLoading}>New chat</button>
            </div>
            {historyError && <p role="alert" className="text-xs text-warn">{historyError}</p>}
          </div>
          {/* Messages Area */}
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5" role="log" aria-label="Chat messages" aria-live="polite" aria-relevant="additions">
            {nextCursor && <button className="btn-ghost text-xs" disabled={isLoading || !available} onClick={() => loadHistory(conversationId, nextCursor)}>Load older messages</button>}
            {messages.map((msg, index) => msg.role === 'gap' ? <p key={index} className="border-y border-white/10 py-2 text-center text-xs text-warn">{msg.content}</p> : (
              <div
                key={index}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl border px-4 py-3 ${
                    msg.role === 'user'
                      ? 'rounded-tr-sm text-ink'
                      : 'rounded-tl-sm border-white/10 bg-white/5 text-ink-soft'
                  }`}
                  style={msg.role === 'user' ? {
                    background: 'color-mix(in oklab, var(--gv-accent) 24%, transparent)',
                    borderColor: 'color-mix(in oklab, var(--gv-accent) 38%, transparent)',
                  } : undefined}
                >
                  <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[.1em] text-ink-muted">{msg.role === 'user' ? 'You' : 'GymVerse'}</p>
                  <p className="break-words text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="glass-inset flex items-center space-x-2 px-4 py-3 text-ink-muted">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-xs font-medium">Typing...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="shrink-0 border-t border-white/10 bg-white/[.025] p-4">
            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={temporary ? 'Message temporary chat...' : 'Type your message...'}
                className="field min-w-0 flex-1 text-sm placeholder:text-ink-muted disabled:opacity-60"
                aria-label="Message GymVerse Assistant"
                maxLength={2000}
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={!inputValue.trim() || isLoading}
                className="btn-primary grid h-11 w-11 shrink-0 place-items-center p-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                aria-label="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </section>
      )}
    </div>
  );
}
