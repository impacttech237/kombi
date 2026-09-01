import type { ReactNode } from 'react';
import { Icon, Logo } from './ui.js';

const ONGLETS = [
  { code: 'dashboard', label: 'Accueil', icone: 'dashboard' },
  { code: 'caisse', label: 'Caisse', icone: 'caisse' },
  { code: 'stock', label: 'Stock', icone: 'stock' },
  { code: 'tiers', label: 'Tiers', icone: 'tiers' },
  { code: 'compta', label: 'Compta', icone: 'graph' },
];

export function TopBar({ nomEntreprise, onChangeEntreprise }: {
  nomEntreprise: string; onChangeEntreprise?: () => void;
}) {
  return (
    <header style={{
      background: 'var(--vert)', color: '#fff', borderRadius: '0 0 26px 26px',
      padding: '16px 18px 22px', display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{ width: 40, height: 40, borderRadius: 14, background: 'rgba(255,255,255,.15)',
        display: 'grid', placeItems: 'center', fontWeight: 800 }}>K</div>
      <button onClick={onChangeEntreprise} style={{
        flex: 1, background: 'rgba(255,255,255,.14)', border: 0, color: '#fff',
        borderRadius: 'var(--pill)', padding: '10px 16px', display: 'flex', alignItems: 'center',
        gap: 8, textAlign: 'left', fontWeight: 600,
      }}>
        <Icon name="boite" size={16} />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {nomEntreprise}
        </span>
        <span style={{ opacity: .7 }}>▾</span>
      </button>
      <button style={{ background: 'rgba(255,255,255,.14)', border: 0, color: '#fff',
        width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center' }}>
        <Icon name="cloche" size={18} />
      </button>
    </header>
  );
}

export function BottomNav({ actif, onNaviguer, masquer = [] }: {
  actif: string; onNaviguer: (code: string) => void; masquer?: string[];
}) {
  return (
    <nav style={{
      position: 'sticky', bottom: 12, margin: '0 auto', maxWidth: 440, width: 'calc(100% - 24px)',
      background: 'var(--vert)', borderRadius: 'var(--pill)', padding: 6,
      display: 'flex', justifyContent: 'space-between', boxShadow: 'var(--ombre)',
    }}>
      {ONGLETS.filter((o) => !masquer.includes(o.code)).map((o) => {
        const on = o.code === actif;
        return (
          <button key={o.code} onClick={() => onNaviguer(o.code)} title={o.label}
            style={{
              flex: on ? '1' : '0 0 auto', background: on ? '#fff' : 'transparent',
              color: on ? 'var(--vert)' : 'rgba(255,255,255,.85)', border: 0,
              borderRadius: 'var(--pill)', padding: on ? '10px 16px' : '10px', display: 'flex',
              alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13,
            }}>
            <Icon name={o.icone} size={20} />
            {on && <span>{o.label}</span>}
          </button>
        );
      })}
    </nav>
  );
}

export function Ecran({ children, nav }: { children: ReactNode; nav: ReactNode }) {
  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column',
      maxWidth: 480, margin: '0 auto', background: 'var(--vert-brume)' }}>
      <main style={{ flex: 1, padding: '16px 16px 8px' }}>{children}</main>
      {nav}
      <div style={{ height: 12 }} />
    </div>
  );
}
