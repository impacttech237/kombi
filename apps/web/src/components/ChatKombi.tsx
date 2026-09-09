import { useCallback, useEffect, useRef, useState } from 'react';

const BASE = import.meta.env.VITE_API_URL ?? '';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: { name: string; status: 'running' | 'done' }[];
}

interface StreamEvent {
  type: 'text' | 'tool_start' | 'tool_end';
  text?: string;
  toolName?: string;
  toolCallId?: string;
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

function IcoRefresh({ cls }: { cls?: string }) {
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  );
}

function IcoSettings({ cls }: { cls?: string }) {
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

interface Reminder {
  id: string;
  type: string;
  enabled: number;
  last_run: string | null;
}

const REMINDER_TYPES: { type: string; label: string; description: string }[] = [
  { type: 'daily_summary', label: 'Résumé quotidien', description: 'Ventes et trésorerie chaque matin à 8h' },
  { type: 'unpaid_invoices', label: 'Factures impayées', description: 'Rappel des factures à relancer' },
  { type: 'low_stock', label: 'Stock bas', description: 'Alerte produits en dessous du seuil' },
];

function RemindersPanel({ entrepriseId, onClose }: { entrepriseId: string; onClose: () => void }) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BASE}/api/ai/reminders`, {
      headers: { 'x-entreprise-id': entrepriseId },
      credentials: 'include',
    })
      .then(r => r.ok ? r.json() as Promise<{ reminders: Reminder[] }> : null)
      .then(d => { if (d) setReminders(d.reminders); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [entrepriseId]);

  const toggle = (type: string, enabled: boolean) => {
    setReminders(prev => prev.map(r => r.type === type ? { ...r, enabled: enabled ? 1 : 0 } : r));
    const existing = reminders.find(r => r.type === type);
    if (!existing) {
      setReminders(prev => [...prev, { id: '', type, enabled: enabled ? 1 : 0, last_run: null }]);
    }
    fetch(`${BASE}/api/ai/reminders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-entreprise-id': entrepriseId },
      credentials: 'include',
      body: JSON.stringify({ type, enabled }),
    }).catch(() => {});
  };

  const isEnabled = (type: string) => reminders.find(r => r.type === type)?.enabled === 1;

  return (
    <div className="k-chat-reminders">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <strong style={{ fontSize: 14 }}>Rappels automatiques</strong>
        <button className="k-icobtn" style={{ width: 28, height: 28 }} onClick={onClose}><IcoX cls="w-3.5 h-3.5" /></button>
      </div>
      {loading ? (
        <p style={{ fontSize: 12, color: 'var(--k-muted)' }}>Chargement…</p>
      ) : (
        REMINDER_TYPES.map(rt => (
          <label key={rt.type} className="k-chat-reminder-row">
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 600 }}>{rt.label}</p>
              <p style={{ fontSize: 11, color: 'var(--k-muted)', lineHeight: 1.3 }}>{rt.description}</p>
            </div>
            <input
              type="checkbox"
              checked={isEnabled(rt.type)}
              onChange={e => toggle(rt.type, e.target.checked)}
              className="k-chat-toggle"
            />
          </label>
        ))
      )}
    </div>
  );
}

const TOOL_LABELS: Record<string, string> = {
  stats_jour: 'Statistiques du jour',
  tendance_7_jours: 'Tendance 7 jours',
  ventes_recentes: 'Ventes récentes',
  ventes_a_credit: 'Ventes à crédit',
  soldes_tresorerie: 'Soldes trésorerie',
  tresorerie_du_jour: 'Trésorerie du jour',
  depenses_recentes: 'Dépenses récentes',
  analyse_depenses: 'Analyse des dépenses',
  liste_produits: 'Produits en stock',
  factures_impayees: 'Factures impayées',
  liste_factures: 'Factures',
  dettes_fournisseurs: 'Dettes fournisseurs',
  etats_financiers: 'États financiers',
  ca_cumule: 'CA cumulé',
  marge_cumulee: 'Marge cumulée',
  meilleures_ventes: 'Meilleures ventes',
  cockpit: 'Tableau de bord',
  alertes: 'Alertes',
  prevision_tresorerie: 'Prévision trésorerie',
  comparaison_mensuelle: 'Comparaison mensuelle',
  seuil_rentabilite: 'Seuil de rentabilité',
  problemes_prioritaires: 'Problèmes prioritaires',
  liste_tiers: 'Clients & fournisseurs',
  liste_ecritures: 'Écritures comptables',
  mouvements_tresorerie: 'Mouvements trésorerie',
  enregistrer_vente: 'Enregistrement vente',
  creer_depense: 'Enregistrement dépense',
  creer_tiers: 'Création tiers',
  creer_produit: 'Création produit',
  creer_facture: 'Création facture',
  emettre_facture: 'Émission facture',
  payer_vente: 'Paiement vente',
  payer_facture: 'Paiement facture',
  approvisionner_stock: 'Approvisionnement stock',
};

function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name.replace(/_/g, ' ');
}

function parseStreamLine(line: string): StreamEvent | null {
  if (line.startsWith('0:')) {
    try { return { type: 'text', text: JSON.parse(line.slice(2)) as string }; } catch { return null; }
  }
  if (line.startsWith('9:')) {
    try {
      const d = JSON.parse(line.slice(2)) as { toolCallId: string; toolName: string };
      return { type: 'tool_start', toolName: d.toolName, toolCallId: d.toolCallId };
    } catch { return null; }
  }
  if (line.startsWith('a:')) {
    try {
      const d = JSON.parse(line.slice(2)) as { toolCallId: string };
      return { type: 'tool_end', toolCallId: d.toolCallId };
    } catch { return null; }
  }
  return null;
}

async function* streamChat(
  entrepriseId: string,
  messages: { role: string; content: string }[],
): AsyncGenerator<StreamEvent> {
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
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const evt = parseStreamLine(line);
      if (evt) yield evt;
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

function ToolCallChip({ name, status }: { name: string; status: 'running' | 'done' }) {
  return (
    <span className={`k-chat-tool-chip ${status}`}>
      {status === 'running' && <span className="k-chat-tool-spinner" />}
      {status === 'done' && <span style={{ color: 'var(--k-lime)', marginRight: 4 }}>✓</span>}
      {toolLabel(name)}
    </span>
  );
}

function renderMarkdown(text: string): JSX.Element {
  const lines = text.split('\n');
  const elements: JSX.Element[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith('```')) {
        codeLines.push(lines[i]!);
        i++;
      }
      i++;
      elements.push(<pre key={key++} className="k-chat-code">{codeLines.join('\n')}</pre>);
      continue;
    }

    if (line.startsWith('### ')) {
      elements.push(<strong key={key++} style={{ display: 'block', fontSize: 13, marginTop: 8, marginBottom: 2 }}>{inlineFormat(line.slice(4))}</strong>);
      i++; continue;
    }
    if (line.startsWith('## ')) {
      elements.push(<strong key={key++} style={{ display: 'block', fontSize: 14, marginTop: 10, marginBottom: 2 }}>{inlineFormat(line.slice(3))}</strong>);
      i++; continue;
    }
    if (line.startsWith('# ')) {
      elements.push(<strong key={key++} style={{ display: 'block', fontSize: 15, marginTop: 10, marginBottom: 4 }}>{inlineFormat(line.slice(2))}</strong>);
      i++; continue;
    }

    if (/^[-*] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i]!)) {
        items.push(lines[i]!.slice(2));
        i++;
      }
      elements.push(
        <ul key={key++} className="k-chat-list">
          {items.map((item, j) => <li key={j}>{inlineFormat(item)}</li>)}
        </ul>,
      );
      continue;
    }

    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\d+\.\s*/, ''));
        i++;
      }
      elements.push(
        <ol key={key++} className="k-chat-list">
          {items.map((item, j) => <li key={j}>{inlineFormat(item)}</li>)}
        </ol>,
      );
      continue;
    }

    if (line.trim() === '') {
      elements.push(<div key={key++} style={{ height: 6 }} />);
      i++; continue;
    }

    elements.push(<p key={key++} style={{ margin: 0 }}>{inlineFormat(line)}</p>);
    i++;
  }

  return <>{elements}</>;
}

function inlineFormat(text: string): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = [];
  let remaining = text;
  let k = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const codeMatch = remaining.match(/`([^`]+)`/);

    let earliest: { idx: number; len: number; el: JSX.Element } | null = null;

    if (boldMatch?.index !== undefined) {
      const el = <strong key={`b${k++}`}>{boldMatch[1]}</strong>;
      earliest = { idx: boldMatch.index, len: boldMatch[0].length, el };
    }
    if (codeMatch?.index !== undefined) {
      const candidate = { idx: codeMatch.index, len: codeMatch[0].length, el: <code key={`c${k++}`} className="k-chat-inline-code">{codeMatch[1]}</code> };
      if (!earliest || candidate.idx < earliest.idx) earliest = candidate;
    }

    if (!earliest) {
      parts.push(remaining);
      break;
    }

    if (earliest.idx > 0) parts.push(remaining.slice(0, earliest.idx));
    parts.push(earliest.el);
    remaining = remaining.slice(earliest.idx + earliest.len);
  }

  return parts;
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
      {msg.toolCalls && msg.toolCalls.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4, maxWidth: '82%' }}>
          {msg.toolCalls.map((tc, i) => (
            <ToolCallChip key={i} name={tc.name} status={tc.status} />
          ))}
        </div>
      )}
      {msg.content && (
        <div style={{
          maxWidth: '82%',
          padding: '10px 14px',
          borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          background: isUser ? 'var(--k-lime)' : 'var(--k-surface-soft)',
          color: isUser ? '#fff' : 'var(--k-ink)',
          fontSize: 14,
          lineHeight: 1.5,
          wordBreak: 'break-word',
        }}>
          {isUser ? msg.content : renderMarkdown(msg.content)}
        </div>
      )}
    </div>
  );
}

const SUGGESTIONS = [
  'Comment vont mes ventes aujourd\'hui ?',
  'Quels sont mes soldes de trésorerie ?',
  'Y a-t-il des alertes ?',
  'Résume mon tableau de bord',
];

interface ProactiveAlert {
  type: string;
  gravite: string;
  message: string;
}

export function ChatKombi({ entrepriseId }: { entrepriseId: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<ProactiveAlert[]>([]);
  const [alertBadge, setAlertBadge] = useState(0);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [showReminders, setShowReminders] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  // Load conversation history on first open
  useEffect(() => {
    if (!open || historyLoaded) return;
    setHistoryLoaded(true);
    fetch(`${BASE}/api/ai/history`, {
      headers: { 'x-entreprise-id': entrepriseId },
      credentials: 'include',
    })
      .then(r => r.ok ? r.json() as Promise<{ messages: { id: string; role: string; content: string }[] }> : null)
      .then(data => {
        if (data?.messages?.length) {
          setMessages(data.messages.map(m => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })));
        }
      })
      .catch(() => { /* silently ignore */ });
  }, [open, historyLoaded, entrepriseId]);

  // Poll proactive alerts every 5 minutes
  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      fetch(`${BASE}/api/ai/alerts`, {
        headers: { 'x-entreprise-id': entrepriseId },
        credentials: 'include',
      })
        .then(r => r.ok ? r.json() as Promise<{ alertes: ProactiveAlert[] }> : null)
        .then(data => {
          if (!cancelled && data?.alertes) {
            setAlerts(data.alertes);
            const critiques = data.alertes.filter(a => a.gravite === 'critique').length;
            setAlertBadge(critiques);
          }
        })
        .catch(() => {});
    };
    poll();
    const timer = setInterval(poll, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [entrepriseId]);

  const newConversation = useCallback(() => {
    setMessages([]);
    setError(null);
    fetch(`${BASE}/api/ai/history`, {
      method: 'DELETE',
      headers: { 'x-entreprise-id': entrepriseId },
      credentials: 'include',
    }).catch(() => {});
  }, [entrepriseId]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return;
    setError(null);
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text.trim() };
    const assistantMsg: Message = { id: crypto.randomUUID(), role: 'assistant', content: '', toolCalls: [] };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setStreaming(true);

    const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));
    const toolMap = new Map<string, string>();

    try {
      for await (const evt of streamChat(entrepriseId, history)) {
        if (evt.type === 'text' && evt.text) {
          setMessages(prev => {
            const copy = [...prev];
            const last = { ...copy[copy.length - 1]! };
            last.content += evt.text;
            copy[copy.length - 1] = last;
            return copy;
          });
        } else if (evt.type === 'tool_start' && evt.toolName && evt.toolCallId) {
          toolMap.set(evt.toolCallId, evt.toolName);
          const name = evt.toolName;
          setMessages(prev => {
            const copy = [...prev];
            const last = { ...copy[copy.length - 1]! };
            last.toolCalls = [...(last.toolCalls ?? []), { name, status: 'running' }];
            copy[copy.length - 1] = last;
            return copy;
          });
        } else if (evt.type === 'tool_end' && evt.toolCallId) {
          const name = toolMap.get(evt.toolCallId);
          if (name) {
            setMessages(prev => {
              const copy = [...prev];
              const last = { ...copy[copy.length - 1]! };
              last.toolCalls = (last.toolCalls ?? []).map(tc =>
                tc.name === name && tc.status === 'running' ? { ...tc, status: 'done' as const } : tc,
              );
              copy[copy.length - 1] = last;
              return copy;
            });
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur de connexion';
      setError(msg);
      setMessages(prev => {
        const copy = [...prev];
        if (copy[copy.length - 1]?.content === '' && !(copy[copy.length - 1]?.toolCalls?.length)) copy.pop();
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
        onClick={() => { setOpen(o => !o); setAlertBadge(0); }}
        className="k-chat-fab"
        aria-label={open ? 'Fermer l\'assistant' : 'Ouvrir l\'assistant Kombi'}
      >
        {open ? <IcoChevDown cls="w-6 h-6" /> : <IcoBot cls="w-6 h-6" />}
        {!open && alertBadge > 0 && (
          <span className="k-chat-badge">{alertBadge}</span>
        )}
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
            <button
              className="k-icobtn"
              style={{ width: 34, height: 34 }}
              onClick={() => setShowReminders(s => !s)}
              aria-label="Rappels"
              title="Rappels automatiques"
            >
              <IcoSettings cls="w-4 h-4" />
            </button>
            <button
              className="k-icobtn"
              style={{ width: 34, height: 34 }}
              onClick={newConversation}
              aria-label="Nouvelle conversation"
              title="Nouvelle conversation"
            >
              <IcoRefresh cls="w-4 h-4" />
            </button>
            <button className="k-icobtn" style={{ width: 34, height: 34 }} onClick={() => setOpen(false)} aria-label="Fermer">
              <IcoX cls="w-4 h-4" />
            </button>
          </div>

          {/* Reminders settings */}
          {showReminders && (
            <RemindersPanel entrepriseId={entrepriseId} onClose={() => setShowReminders(false)} />
          )}

          {/* Proactive alerts */}
          {alerts.length > 0 && messages.length === 0 && (
            <div className="k-chat-alerts">
              {alerts.map((a, i) => (
                <button
                  key={i}
                  className={`k-chat-alert ${a.gravite}`}
                  onClick={() => void send(a.message)}
                >
                  <span className="k-chat-alert-dot" />
                  {a.message}
                </button>
              ))}
            </div>
          )}

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
            {streaming && messages[messages.length - 1]?.content === '' && !(messages[messages.length - 1]?.toolCalls?.length) && <TypingDots />}
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
              onChange={e => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
              }}
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
