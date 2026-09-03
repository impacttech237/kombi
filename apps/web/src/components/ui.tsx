/**
 * Composants UI partagés — reskinnés dans le langage visuel du prototype Figma Make (dark,
 * accent citron vert #b4e033) pour les écrans sans référence prototype qui en dépendent encore
 * (Login, Dépenses, Créances, Dettes, Ventes historique, Journal).
 */
import type { ReactNode } from 'react';

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
    facture: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6',
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
    <div className="shrink-0 bg-[#b4e033] text-[#0e1c0f] font-extrabold rounded-2xl flex items-center justify-center"
      style={{ width: size, height: size, fontSize: size * 0.5 }}>
      K
    </div>
  );
}

const VARIANTE_CLS: Record<string, string> = {
  primaire: 'bg-[#b4e033] text-[#0e1c0f] active:scale-95',
  clair: 'bg-[#1e3222] text-[#edf5ea] border border-[#2a4230] hover:bg-[#2a4230]',
  ghost: 'bg-transparent text-[#b4e033] hover:bg-[#b4e033]/10',
};

export function Bouton({
  children, onClick, type = 'button', variante = 'primaire', bloc, disabled,
}: {
  children: ReactNode; onClick?: () => void; type?: 'button' | 'submit';
  variante?: 'primaire' | 'clair' | 'ghost'; bloc?: boolean; disabled?: boolean;
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${bloc ? 'w-full' : ''} ${VARIANTE_CLS[variante]}`}>
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
  const inputCls = 'w-full bg-[#1e3222] text-[#edf5ea] placeholder:text-[#4a6b4a] rounded-xl px-4 py-3 text-sm border border-[#2a4230] focus:border-[#b4e033] focus:outline-none';
  return (
    <div className="mb-4">
      <label className="text-[#6b9165] text-xs font-medium block mb-1.5">{label}</label>
      {options ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input type={type} value={value} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)} className={inputCls} />
      )}
    </div>
  );
}
