import type { ReactNode } from 'react';

/* ── Icônes (SVG inline, trait 2px) ── */
const P = ({ d }: { d: string }) => (
  <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
);
export function Icon({ name, size = 22 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    dashboard: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
    caisse: 'M3 7h18v12H3zM3 11h18M7 15h4',
    stock: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8',
    tiers: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87',
    graph: 'M4 19V5M4 15l5-5 4 3 7-8M20 10V5h-5',
    cloche: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
    recherche: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
    plus: 'M12 5v14M5 12h14',
    argent: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
    boite: 'M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z',
    check: 'M20 6L9 17l-5-5',
    hausse: 'M7 17L17 7M17 7H8M17 7v9',
    baisse: 'M7 7l10 10M17 17H8M17 17V8',
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <P d={paths[name] ?? ''} />
    </svg>
  );
}

export function Logo({ size = 40 }: { size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 14, background: 'var(--vert)',
      display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: size * 0.5,
      flexShrink: 0,
    }}>K</div>
  );
}

export function Bouton({
  children, onClick, type = 'button', variante = 'primaire', bloc, disabled,
}: {
  children: ReactNode; onClick?: () => void; type?: 'button' | 'submit';
  variante?: 'primaire' | 'clair' | 'ghost'; bloc?: boolean; disabled?: boolean;
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`btn btn-${variante}${bloc ? ' btn-bloc' : ''}`}>
      {children}
    </button>
  );
}

export function Champ({
  label, type = 'text', value, onChange, placeholder, options,
}: {
  label: string; type?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; options?: { value: string; label: string }[];
}) {
  return (
    <div className="champ">
      <label>{label}</label>
      {options ? (
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input type={type} value={value} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

/* Carte de statistique (style dashboard des modèles) */
export function CarteStat({
  titre, valeur, delta, positif = true, icone,
}: {
  titre: string; valeur: string; delta?: string; positif?: boolean; icone: string;
}) {
  return (
    <div className="carte" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="muet" style={{ fontSize: 13, fontWeight: 500 }}>{titre}</span>
        <span style={{
          width: 34, height: 34, borderRadius: 12, background: 'var(--vert-clair)',
          color: 'var(--vert)', display: 'grid', placeItems: 'center',
        }}><Icon name={icone} size={18} /></span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.5px' }}>{valeur}</div>
      {delta && (
        <span className={`chip ${positif ? 'chip-ok' : 'chip-bas'}`}>
          <Icon name={positif ? 'hausse' : 'baisse'} size={13} /> {delta}
        </span>
      )}
    </div>
  );
}
