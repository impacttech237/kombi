import { useEffect, useState, type ReactNode } from 'react';
import { listerNotifications, type NotificationActive } from '../lib/api.js';
import { Icon, Logo } from './ui.js';

const ONGLETS = [
  { code: 'dashboard', label: 'Accueil', icone: 'dashboard' },
  { code: 'caisse', label: 'Caisse', icone: 'caisse' },
  { code: 'stock', label: 'Stock', icone: 'stock' },
  { code: 'factures', label: 'Factures', icone: 'facture' },
  { code: 'compta', label: 'Compta', icone: 'graph' },
];

export function TopBar({ nomEntreprise, entrepriseId, onChangeEntreprise }: {
  nomEntreprise: string; entrepriseId?: string; onChangeEntreprise?: () => void;
}) {
  const [notifs, setNotifs] = useState<NotificationActive[] | null>(null);
  const [ouvert, setOuvert] = useState(false);

  useEffect(() => {
    if (!entrepriseId) return;
    listerNotifications(entrepriseId).then(setNotifs).catch(() => {});
  }, [entrepriseId]);

  const critiques = (notifs ?? []).filter((n) => n.gravite === 'critique').length;

  return (
    <header style={{
      background: 'var(--vert)', color: '#fff', borderRadius: '0 0 26px 26px',
      padding: '16px 18px 22px', display: 'flex', alignItems: 'center', gap: 12, position: 'relative',
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
      <button onClick={() => setOuvert(!ouvert)} style={{
        background: 'rgba(255,255,255,.14)', border: 0, color: '#fff', position: 'relative',
        width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center' }}>
        <Icon name="cloche" size={18} />
        {(notifs?.length ?? 0) > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, borderRadius: 8,
            background: critiques > 0 ? 'var(--danger)' : '#fff',
            color: critiques > 0 ? '#fff' : 'var(--vert)',
            fontSize: 10, fontWeight: 700, display: 'grid', placeItems: 'center', padding: '0 3px',
          }}>
            {notifs!.length}
          </span>
        )}
      </button>

      {ouvert && (
        <div style={{
          position: 'absolute', top: '100%', right: 18, marginTop: 8, width: 300, maxWidth: 'calc(100vw - 36px)',
          background: '#fff', color: 'var(--texte, #111)', borderRadius: 16, boxShadow: 'var(--ombre)',
          padding: 10, zIndex: 20, maxHeight: 360, overflowY: 'auto',
        }}>
          {!notifs || notifs.length === 0 ? (
            <p className="muet" style={{ margin: 6, fontSize: 13 }}>Aucune notification.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {notifs.map((n, i) => (
                <div key={i} style={{
                  padding: '8px 10px', borderRadius: 10, fontSize: 13,
                  background: n.gravite === 'critique' ? 'var(--danger-clair, #fdecec)' : 'var(--fond, #f5f5f5)',
                  color: n.gravite === 'critique' ? 'var(--danger)' : 'inherit',
                }}>
                  {n.libelle}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
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
