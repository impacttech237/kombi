/**
 * Shell de navigation — design system « Cockpit » (maquette validée 2025-09).
 * Desktop : sidebar claire fixe (sections Pilotage / Exploitation / Finances / Admin),
 * recherche, carte Pro, profil + déconnexion en bas.
 * Mobile : barre supérieure (marque + notifications) + barre inférieure + feuille « Menu ».
 * Toutes les icônes sont des SVG (composants Ico*) — aucun émoji.
 */
import { useEffect, useState } from 'react';
import { listerNotifications, type NotificationActive } from '../lib/api.js';
import {
  IcoHome, IcoCart, IcoFile, IcoBox, IcoWlt, IcoBell, IcoX, IcoGrid, IcoLayers,
  IcoUser, IcoUsers, IcoClipboard, IcoBarChart, IcoSettings, IcoTrendDown, IcoHandCoins, IcoLogOut,
  IcoFolder, IcoPercent, IcoTrend, IcoAlert, IcoSearch, Avatar,
} from './icons.js';

export interface NavItem {
  code: string;
  label: string;
  short: string;
  Icon: (p: { cls?: string }) => React.JSX.Element;
  alert?: boolean;
}

/** Onglets toujours visibles sur la barre inférieure mobile. */
const PRIMARY_TABS: NavItem[] = [
  { code: 'dashboard', label: 'Tableau de bord', short: 'Accueil', Icon: IcoHome },
  { code: 'caisse', label: 'Caisse', short: 'Caisse', Icon: IcoCart },
  { code: 'stock', label: 'Stock', short: 'Stock', Icon: IcoBox },
  { code: 'tresorerie', label: 'Trésorerie', short: 'Tréso.', Icon: IcoWlt },
];

/** Sections de navigation (sidebar desktop + feuille menu mobile). */
const SECTIONS: { titre: string; items: NavItem[] }[] = [
  {
    titre: 'Pilotage',
    items: [
      { code: 'dashboard', label: 'Tableau de bord', short: 'Accueil', Icon: IcoHome },
      { code: 'a-decider', label: 'À décider', short: 'À décider', Icon: IcoAlert, alert: true },
      { code: 'rapports', label: 'Rapports & Analyses', short: 'Rapports', Icon: IcoTrend },
    ],
  },
  {
    titre: 'Exploitation',
    items: [
      { code: 'caisse', label: 'Caisse', short: 'Caisse', Icon: IcoCart },
      { code: 'stock', label: 'Stock', short: 'Stock', Icon: IcoBox },
      { code: 'tresorerie', label: 'Trésorerie', short: 'Tréso.', Icon: IcoWlt },
      { code: 'commandes', label: 'Opérations', short: 'Opérations', Icon: IcoClipboard },
      { code: 'factures', label: 'Factures & Devis', short: 'Factures', Icon: IcoFile },
      { code: 'tiers', label: 'Clients & Fournisseurs', short: 'Tiers', Icon: IcoUser },
    ],
  },
  {
    titre: 'Finances',
    items: [
      { code: 'depenses', label: 'Dépenses', short: 'Dépenses', Icon: IcoTrendDown },
      { code: 'creances', label: 'Créances', short: 'Créances', Icon: IcoHandCoins },
      { code: 'dettes', label: 'Dettes', short: 'Dettes', Icon: IcoHandCoins },
      { code: 'pieces', label: 'Pièces justificatives', short: 'Pièces', Icon: IcoFolder },
      { code: 'compta', label: 'Comptabilité', short: 'Compta', Icon: IcoBarChart },
      { code: 'rentabilite', label: 'Rentabilité', short: 'Rentabilité', Icon: IcoPercent },
    ],
  },
  {
    titre: 'Administration',
    items: [
      { code: 'equipe', label: 'Équipe', short: 'Équipe', Icon: IcoUsers },
      { code: 'parametres', label: 'Paramètres', short: 'Réglages', Icon: IcoSettings },
    ],
  },
];

const ALL_NAV = [...PRIMARY_TABS, ...SECTIONS.flatMap((s) => s.items)];

function useNotifications(entrepriseId: string | undefined) {
  const [notifs, setNotifs] = useState<NotificationActive[] | null>(null);
  useEffect(() => {
    if (!entrepriseId) return;
    listerNotifications(entrepriseId).then(setNotifs).catch(() => {});
  }, [entrepriseId]);
  return notifs ?? [];
}

/** Un item de nav réutilisé partout (sidebar + feuille menu). */
function NavButton({ item, active, onNav, masquer }: {
  item: NavItem; active: string; onNav: (c: string) => void; masquer: string[];
}) {
  if (masquer.includes(item.code)) return null;
  return (
    <button className={`k-nav${active === item.code ? ' on' : ''}${item.alert ? ' alert' : ''}`} onClick={() => onNav(item.code)}>
      <item.Icon />
      <span style={{ flex: 1 }}>{item.label}</span>
    </button>
  );
}

export function Sidebar({ active, onNav, nomEntreprise, nomUtilisateur, masquer, onLogout }: {
  active: string; onNav: (code: string) => void; nomEntreprise: string; nomUtilisateur: string;
  masquer: string[]; onLogout: () => void;
}) {
  const [q, setQ] = useState('');
  const filtre = (label: string) => !q.trim() || label.toLowerCase().includes(q.trim().toLowerCase());

  return (
    <aside className="k-side">
      <div className="k-brand">
        <span className="mark"><IcoLayers /></span>
        <div style={{ minWidth: 0 }}>
          <b>Kombi</b>
          <small style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nomEntreprise}</small>
        </div>
      </div>

      <label className="k-search">
        <IcoSearch cls="w-4 h-4" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" aria-label="Rechercher un écran" />
        <kbd>⌘K</kbd>
      </label>

      <nav style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, margin: '0 -4px', padding: '0 4px' }}>
        {SECTIONS.map((s) => {
          const items = s.items.filter((i) => filtre(i.label) && !masquer.includes(i.code));
          if (items.length === 0) return null;
          return (
            <div key={s.titre}>
              <p className="k-sec">{s.titre}</p>
              {items.map((item) => <NavButton key={item.code} item={item} active={active} onNav={onNav} masquer={masquer} />)}
            </div>
          );
        })}
      </nav>

      <div className="k-upsell">
        <b>Passez à Kombi Pro</b>
        <p>Multi-boutiques, exports comptables et alertes WhatsApp.</p>
        <button onClick={() => onNav('parametres')}>Découvrir</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--k-line)' }}>
        <Avatar name={nomUtilisateur} size="sm" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nomUtilisateur}</p>
        </div>
        <button className="k-icobtn" style={{ width: 34, height: 34 }} onClick={onLogout} aria-label="Se déconnecter" title="Se déconnecter">
          <IcoLogOut cls="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
}

function NotifSheet({ notifs, onClose }: { notifs: NotificationActive[]; onClose: () => void }) {
  return (
    <div className="k-sheet open" onClick={onClose}>
      <div className="scrim" />
      <div className="panel" style={{ left: 'auto', right: 0, width: '86%', maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <p style={{ fontWeight: 700, fontSize: 16 }}>Notifications</p>
          <button className="k-icobtn" style={{ width: 34, height: 34 }} onClick={onClose} aria-label="Fermer"><IcoX cls="w-4 h-4" /></button>
        </div>
        {notifs.length === 0 ? (
          <p className="k-empty">Aucune notification.</p>
        ) : notifs.map((n, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--k-surface-soft)', border: '1px solid var(--k-line)', borderRadius: 14, padding: '12px 14px', marginBottom: 8 }}>
            <span style={{ marginTop: 5, width: 8, height: 8, borderRadius: 999, flex: '0 0 auto', background: n.gravite === 'critique' ? 'var(--k-danger)' : 'var(--k-warn)' }} />
            <span style={{ fontSize: 13.5, lineHeight: 1.4 }}>{n.libelle}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TopBar({ active, isOnline, entrepriseId, nomUtilisateur }: {
  active: string; isOnline: boolean; entrepriseId: string | undefined; nomUtilisateur: string;
}) {
  const item = ALL_NAV.find((i) => i.code === active);
  const [open, setOpen] = useState(false);
  const notifs = useNotifications(entrepriseId);
  const hasCritical = notifs.some((n) => n.gravite === 'critique');

  return (
    <>
      {!isOnline && (
        <div style={{ background: 'var(--k-warn-soft)', color: 'var(--k-warn)', fontSize: 12, fontWeight: 500, padding: '7px 16px', textAlign: 'center' }}>
          Mode hors-ligne — données sauvegardées localement
        </div>
      )}
      <div className="k-topbar">
        <span className="mark"><IcoLayers cls="w-4 h-4" /></span>
        <b style={{ flex: 1 }}>{item?.label ?? 'Kombi'}</b>
        <button className="k-icobtn" style={{ width: 38, height: 38, position: 'relative' }} onClick={() => setOpen(true)} aria-label="Notifications">
          <IcoBell cls="w-4 h-4" />
          {notifs.length > 0 && (
            <span style={{ position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, padding: '0 3px', borderRadius: 999, display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 700, color: '#fff', background: hasCritical ? 'var(--k-danger)' : 'var(--k-warn)' }}>{notifs.length}</span>
          )}
        </button>
        <Avatar name={nomUtilisateur} size="sm" />
      </div>
      {open && <NotifSheet notifs={notifs} onClose={() => setOpen(false)} />}
    </>
  );
}

export function BottomNav({ active, onNav, masquer, nomEntreprise, onLogout }: {
  active: string; onNav: (code: string) => void; masquer: string[]; nomEntreprise: string; onLogout: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const tabs = PRIMARY_TABS.filter((n) => !masquer.includes(n.code));
  const go = (code: string) => { onNav(code); setMenu(false); };
  const menuActive = SECTIONS.flatMap((s) => s.items).some((i) => i.code === active && !PRIMARY_TABS.some((t) => t.code === i.code));

  return (
    <>
      <nav className="k-bottomnav">
        {tabs.map(({ code, short, Icon }) => (
          <button key={code} className={active === code ? 'on' : ''} onClick={() => go(code)}>
            <Icon /><span>{short}</span>
          </button>
        ))}
        <button className={menuActive ? 'on' : ''} onClick={() => setMenu(true)}>
          <IcoGrid /><span>Menu</span>
        </button>
      </nav>

      <div className={`k-sheet${menu ? ' open' : ''}`}>
        <div className="scrim" onClick={() => setMenu(false)} />
        <div className="panel">
          <div className="k-brand" style={{ paddingTop: 0 }}>
            <span className="mark"><IcoLayers /></span>
            <div style={{ minWidth: 0 }}><b>Kombi</b><small style={{ display: 'block' }}>{nomEntreprise}</small></div>
            <button className="k-icobtn" style={{ width: 34, height: 34, marginLeft: 'auto' }} onClick={() => setMenu(false)} aria-label="Fermer"><IcoX cls="w-4 h-4" /></button>
          </div>
          {SECTIONS.map((s) => {
            const items = s.items.filter((i) => !masquer.includes(i.code));
            if (items.length === 0) return null;
            return (
              <div key={s.titre}>
                <p className="k-sec">{s.titre}</p>
                {items.map((item) => (
                  <button key={item.code} className={`k-nav${active === item.code ? ' on' : ''}${item.alert ? ' alert' : ''}`} onClick={() => go(item.code)}>
                    <item.Icon /><span style={{ flex: 1 }}>{item.label}</span>
                  </button>
                ))}
              </div>
            );
          })}
          <button className="k-nav" style={{ color: 'var(--k-danger)', marginTop: 8 }} onClick={() => { setMenu(false); onLogout(); }}>
            <IcoLogOut /><span style={{ flex: 1 }}>Se déconnecter</span>
          </button>
        </div>
      </div>
    </>
  );
}

export function AppShell({ active, onNav, nomEntreprise, nomUtilisateur, entrepriseId, isOnline, masquer = [], onLogout, children }: {
  active: string; onNav: (code: string) => void; nomEntreprise: string; nomUtilisateur: string;
  entrepriseId: string | undefined; isOnline: boolean; masquer?: string[]; onLogout: () => void; children: React.ReactNode;
}) {
  return (
    <div className="kombi-app k-shell">
      <Sidebar active={active} onNav={onNav} nomEntreprise={nomEntreprise} nomUtilisateur={nomUtilisateur} masquer={masquer} onLogout={onLogout} />
      <div className="k-body">
        <TopBar active={active} isOnline={isOnline} entrepriseId={entrepriseId} nomUtilisateur={nomUtilisateur} />
        <main className="k-main">{children}</main>
      </div>
      <BottomNav active={active} onNav={onNav} masquer={masquer} nomEntreprise={nomEntreprise} onLogout={onLogout} />
    </div>
  );
}

export { PRIMARY_TABS, SECTIONS };
