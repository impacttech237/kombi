import { useCallback, useEffect, useRef, useState } from 'react';

const BASE = import.meta.env.VITE_API_URL ?? '';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

function IcoSend({ cls }: { cls?: string }) {
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2 11 13" /><path d="M22 2 15 22 11 13 2 9z" />
    </svg>
  );
}

function IcoBot({ cls }: { cls?: string }) {
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <path d="M9 15h0" /><path d="M15 15h0" />
    </svg>
  );
}

function IcoX({ cls }: { cls?: string }) {
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" /><path d="M6 6l12 12" />
    </svg>
  );
}

function IcoChevDown({ cls }: { cls?: string }) {
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

async function* streamChat(entrepriseId: string, messages: { role: string; content: string }[]): AsyncGenerator<string> {
  const res = await fetch(`${BASE}/api/ai/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-entreprise-id': entrepriseId },
    credentials: 'include',
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { erreur?: string };
    throw new Error(err.erreur ?? `Erreur ${res.status}`);
  }
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // AI SDK data stream: lines like 0:"text chunk"\n
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('0:')) {
        try {
          const text = JSON.parse(line.slice(2)) as string;
          yield text;
        } catch { /* skip malformed */ }
      }
    }
  }
}

function TypingDots() {
  return (
    <span className="k-chat-dots">
      <span /><span /><span />
    </span>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
      <div style={{
        maxWidth: '82%',
        padding: '10px 14px',
        borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        background: isUser ? 'var(--k-lime)' : 'var(--k-surface-soft)',
        color: isUser ? '#fff' : 'var(--k-ink)',
        fontSize: 14,
        lineHeight: 1.5,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {msg.content}
      </div>
    </div>
  );
}

const SUGGESTIONS = [
  'Comment vont mes ventes aujourd\'hui ?',
  'Quels sont mes soldes de trésorerie ?',
  'Y a-t-il des alertes ?',
  'Résume mon tableau de bord',
];

export function ChatKombi({ entrepriseId }: { entrepriseId: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return;
    setError(null);
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text.trim() };
    const assistantMsg: Message = { id: crypto.randomUUID(), role: 'assistant', content: '' };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setStreaming(true);

    const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));

    try {
      for await (const chunk of streamChat(entrepriseId, history)) {
        setMessages(prev => {
          const copy = [...prev];
          const last = copy[copy.length - 1]!;
          copy[copy.length - 1] = { ...last, content: last.content + chunk };
          return copy;
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur de connexion';
      setError(msg);
      setMessages(prev => {
        const copy = [...prev];
        if (copy[copy.length - 1]?.content === '') copy.pop();
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  }, [entrepriseId, messages, streaming]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen(o => !o)}
        className="k-chat-fab"
        aria-label={open ? 'Fermer l\'assistant' : 'Ouvrir l\'assistant Kombi'}
      >
        {open ? <IcoChevDown cls="w-6 h-6" /> : <IcoBot cls="w-6 h-6" />}
      </button>

      {/* Panel */}
      {open && (
        <div className="k-chat-panel">
          {/* Header */}
          <div className="k-chat-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
              <div className="k-chat-avatar"><IcoBot cls="w-5 h-5" /></div>
              <div>
                <p style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>Assistant Kombi</p>
                <p style={{ fontSize: 11, color: 'var(--k-muted)', lineHeight: 1.2 }}>IA · Données en temps réel</p>
              </div>
            </div>
            <button className="k-icobtn" style={{ width: 34, height: 34 }} onClick={() => setOpen(false)} aria-label="Fermer">
              <IcoX cls="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="k-chat-messages" ref={scrollRef}>
            {messages.length === 0 && (
              <div style={{ padding: '24px 16px', textAlign: 'center' }}>
                <div className="k-chat-avatar" style={{ width: 48, height: 48, margin: '0 auto 12px', fontSize: 24 }}>
                  <IcoBot cls="w-7 h-7" />
                </div>
                <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Bonjour !</p>
                <p style={{ fontSize: 13, color: 'var(--k-muted)', marginBottom: 16, lineHeight: 1.5 }}>
                  Je suis votre assistant. Posez-moi une question sur vos ventes, trésorerie, dépenses…
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                  {SUGGESTIONS.map(s => (
                    <button key={s} onClick={() => { void send(s); }} className="k-chat-suggestion">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map(msg => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
            {streaming && messages[messages.length - 1]?.content === '' && <TypingDots />}
          </div>

          {/* Error */}
          {error && (
            <div style={{ padding: '6px 16px', fontSize: 12, color: 'var(--k-danger)', background: 'var(--k-danger-soft, rgba(239,68,68,0.08))' }}>
              {error}
            </div>
          )}

          {/* Input */}
          <div className="k-chat-input-bar">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Écrivez un message…"
              rows={1}
              disabled={streaming}
              className="k-chat-input"
            />
            <button
              onClick={() => void send(input)}
              disabled={!input.trim() || streaming}
              className="k-chat-send"
              aria-label="Envoyer"
            >
              <IcoSend cls="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
