/**
 * Shell de navigation v2 — porté fidèlement du prototype Figma Make
 * (docs/Interface application gestion PME/, fonctions Sidebar/TopBar/BottomNav). Sidebar fixe en
 * desktop (md:flex), TopBar + BottomNav en mobile (md:hidden). Ne pas dévier du design du
 * prototype — seule la donnée (entreprise, rôle, notifications) est réelle.
 */
import { useEffect, useState } from 'react';
import { listerNotifications, type NotificationActive } from '../lib/api.js';
import {
  IcoHome, IcoCart, IcoFile, IcoBox, IcoWlt, IcoBell, IcoLayers, IcoX, IcoChevR, IcoGrid,
  IcoUser, IcoUsers, IcoClipboard, IcoBarChart, IcoSettings, Avatar,
} from './icons.js';

export interface NavItem {
  code: string;
  label: string;
  short: string;
  Icon: (p: { cls?: string }) => React.JSX.Element;
  badge?: number;
}

/**
 * Architecture de navigation (validée avec le porteur du projet, 2026-09-03) : le prototype est
 * conçu mobile-first et ne doit pas être surchargé — seuls 4 onglets restent visibles en
 * permanence, tout le reste vit dans la feuille « Menu », organisée en 2 groupes (même
 * traitement visuel que la section « Administration » de la Sidebar du prototype). Dépenses n'a
 * PAS d'entrée dédiée : elle rejoint le flux de transactions de l'écran Trésorerie (à faire lors
 * du portage de cet écran), au même titre que Créances/Dettes (argent pas encore encaissé/payé).
 */
const PRIMARY_TABS: NavItem[] = [
  { code: 'dashboard', label: 'Tableau de bord', short: 'Accueil', Icon: IcoHome },
  { code: 'caisse', label: 'Ventes', short: 'Ventes', Icon: IcoCart },
  { code: 'stock', label: 'Stock', short: 'Stock', Icon: IcoBox },
  { code: 'tresorerie', label: 'Trésorerie', short: 'Tréso.', Icon: IcoWlt },
];

const MENU_MODULES: NavItem[] = [
  { code: 'factures', label: 'Factures & Devis', short: 'Factures', Icon: IcoFile },
  { code: 'commandes', label: 'Commandes / Missions', short: 'Commandes', Icon: IcoClipboard },
  { code: 'tiers', label: 'Clients & Fournisseurs', short: 'Tiers', Icon: IcoUser },
];

const MENU_ADMIN: NavItem[] = [
  { code: 'compta', label: 'Comptabilité (OHADA)', short: 'Compta', Icon: IcoBarChart },
  { code: 'equipe', label: 'Équipe', short: 'Équipe', Icon: IcoUsers },
  { code: 'parametres', label: 'Paramètres fiscaux', short: 'Réglages', Icon: IcoSettings },
];

const ALL_NAV = [...PRIMARY_TABS, ...MENU_MODULES, ...MENU_ADMIN];

function useNotifications(entrepriseId: string | undefined) {
  const [notifs, setNotifs] = useState<NotificationActive[] | null>(null);
  useEffect(() => {
    if (!entrepriseId) return;
    listerNotifications(entrepriseId).then(setNotifs).catch(() => {});
  }, [entrepriseId]);
  return notifs ?? [];
}

function NotifSheet({ notifs, onClose }: {
  notifs: NotificationActive[]; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60" onClick={onClose}>
      <div className="bg-[#162419] rounded-t-3xl overflow-hidden max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-[#2a4230] rounded-full mx-auto mt-3 mb-1 shrink-0" />
        <div className="px-5 pt-3 pb-2 flex items-center justify-between shrink-0">
          <p className="text-[#edf5ea] font-semibold text-base">Notifications</p>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-[#1e3222] flex items-center justify-center text-[#6b9165]">
            <IcoX cls="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="overflow-y-auto px-4 pb-8 space-y-2">
          {notifs.length === 0 ? (
            <p className="text-[#4a6b4a] text-sm text-center py-8">Aucune notification.</p>
          ) : notifs.map((n, i) => (
            <div key={i}
              className="w-full flex items-start gap-3 bg-[#1e3222] rounded-2xl px-4 py-3 text-left border border-[#2a4230]">
              <span className={`mt-0.5 shrink-0 w-2 h-2 rounded-full ${n.gravite === 'critique' ? 'bg-[#f87171]' : 'bg-[#fbbf24]'}`} />
              <span className="text-[#edf5ea] text-sm leading-snug flex-1">{n.libelle}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Sidebar({ active, onNav, nomEntreprise, nomUtilisateur }: {
  active: string; onNav: (code: string) => void; nomEntreprise: string; nomUtilisateur: string;
}) {
  return (
    <aside className="hidden md:flex w-60 flex-col bg-[#0a1408] border-r border-[#1e3222] shrink-0">
      <div className="px-5 py-5 border-b border-[#1e3222]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-[#b4e033] rounded-lg flex items-center justify-center text-[#0e1c0f]">
            <IcoLayers cls="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[#edf5ea] font-semibold text-sm leading-tight truncate">{nomEntreprise}</p>
            <p className="text-[#4a6b4a] text-xs">Zone CEMAC</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
        {PRIMARY_TABS.map(({ code, label, Icon, badge }) => (
          <button key={code} onClick={() => onNav(code)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${active === code ? 'bg-[#b4e033] text-[#0e1c0f]' : 'text-[#6b9165] hover:bg-[#1e3222] hover:text-[#edf5ea]'}`}>
            <Icon />
            <span className="flex-1 text-left">{label}</span>
            {badge !== undefined && (
              <span className={`text-xs rounded-full px-1.5 py-0.5 font-semibold ${active === code ? 'bg-[#0e1c0f]/20 text-[#0e1c0f]' : 'bg-[#fbbf24]/20 text-[#fbbf24]'}`}>{badge}</span>
            )}
          </button>
        ))}

        <div className="my-3 border-t border-[#1e3222]" />
        <p className="px-3 text-[#3d5c44] text-xs font-medium uppercase tracking-wide mb-1">Modules</p>

        {MENU_MODULES.map(({ code, label, Icon }) => (
          <button key={code} onClick={() => onNav(code)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${active === code ? 'bg-[#b4e033] text-[#0e1c0f]' : 'text-[#6b9165] hover:bg-[#1e3222] hover:text-[#edf5ea]'}`}>
            <Icon />
            <span className="flex-1 text-left">{label}</span>
          </button>
        ))}

        <div className="my-3 border-t border-[#1e3222]" />
        <p className="px-3 text-[#3d5c44] text-xs font-medium uppercase tracking-wide mb-1">Administration</p>

        {MENU_ADMIN.map(({ code, label, Icon }) => (
          <button key={code} onClick={() => onNav(code)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${active === code ? 'bg-[#b4e033] text-[#0e1c0f]' : 'text-[#6b9165] hover:bg-[#1e3222] hover:text-[#edf5ea]'}`}>
            <Icon />
            <span className="flex-1 text-left">{label}</span>
          </button>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-[#1e3222]">
        <div className="flex items-center gap-3">
          <Avatar name={nomUtilisateur} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-[#edf5ea] text-sm font-medium truncate">{nomUtilisateur}</p>
          </div>
          <span className="w-2 h-2 rounded-full bg-[#4ade80] shrink-0" title="En ligne" />
        </div>
      </div>
    </aside>
  );
}

export function TopBar({ active, isOnline, entrepriseId, nomUtilisateur, onNav }: {
  active: string; isOnline: boolean; entrepriseId: string | undefined; nomUtilisateur: string; onNav: (code: string) => void;
}) {
  const item = ALL_NAV.find((i) => i.code === active);
  const [open, setOpen] = useState(false);
  const notifs = useNotifications(entrepriseId);
  const hasCritical = notifs.some((n) => n.gravite === 'critique');

  return (
    <div className="md:hidden flex flex-col border-b border-[#1e3222] bg-[#0a1408]">
      {!isOnline && (
        <div className="bg-[#fbbf24]/10 border-b border-[#fbbf24]/20 px-4 py-2 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#fbbf24]" />
          <span className="text-[#fbbf24] text-xs font-medium">Mode hors-ligne — données sauvegardées localement</span>
        </div>
      )}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#b4e033] rounded-lg flex items-center justify-center text-[#0e1c0f]">
            <IcoLayers cls="w-3.5 h-3.5" />
          </div>
          <span className="text-[#edf5ea] font-semibold text-sm">{item?.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button onClick={() => setOpen(true)}
              className="w-9 h-9 rounded-full bg-[#1e3222] flex items-center justify-center text-[#6b9165]">
              <IcoBell />
            </button>
            {notifs.length > 0 && (
              <span className={`absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full flex items-center justify-center text-[9px] font-bold text-white ${hasCritical ? 'bg-[#f87171]' : 'bg-[#fbbf24]'}`}>
                {notifs.length}
              </span>
            )}
          </div>
          <Avatar name={nomUtilisateur} size="sm" />
        </div>
      </div>

      {open && <NotifSheet notifs={notifs} onClose={() => setOpen(false)} />}
    </div>
  );
}

export function BottomNav({ active, onNav, masquer = [] }: {
  active: string; onNav: (code: string) => void; masquer?: string[];
}) {
  const [showMenu, setShowMenu] = useState(false);
  const mainItems = PRIMARY_TABS.filter((n) => !masquer.includes(n.code));
  const menuModules = MENU_MODULES.filter((n) => !masquer.includes(n.code));
  const menuAdmin = MENU_ADMIN.filter((n) => !masquer.includes(n.code));
  const overflowItems = [...menuModules, ...menuAdmin];
  const menuActive = showMenu || overflowItems.some((n) => n.code === active);

  const navigate = (code: string) => { onNav(code); setShowMenu(false); };

  if (mainItems.length === 0) return null;

  const half = Math.ceil(mainItems.length / 2);
  const firstHalf = mainItems.slice(0, half);
  const secondHalf = mainItems.slice(half);

  return (
    <>
      <nav className="md:hidden fixed bottom-4 left-1/2 -translate-x-1/2 w-[92vw] max-w-sm bg-[#0a1408]/95 backdrop-blur-md border border-[#2a4230] flex z-20 rounded-3xl shadow-xl shadow-black/40 px-1">
        {firstHalf.map(({ code, short, Icon, badge }) => (
          <button key={code} onClick={() => navigate(code)}
            className={`flex-1 flex flex-col items-center gap-1 py-2.5 transition-colors relative ${active === code ? 'text-[#b4e033]' : 'text-[#4a6b4a]'}`}>
            <div className={`w-10 h-7 rounded-full flex items-center justify-center transition-colors ${active === code ? 'bg-[#b4e033]/15' : ''}`}>
              <Icon />
              {badge !== undefined && active !== code && (
                <span className="absolute top-2 right-[calc(50%-20px)] w-4 h-4 flex items-center justify-center text-[9px] font-bold rounded-full bg-[#fbbf24] text-[#0e1c0f]">{badge}</span>
              )}
            </div>
            <span className="text-[9px] font-medium leading-none">{short}</span>
          </button>
        ))}

        {overflowItems.length > 0 && (
          <button onClick={() => setShowMenu((v) => !v)}
            className="flex-1 flex flex-col items-center gap-1 py-2 transition-colors relative">
            <div className={`w-12 h-8 rounded-full flex items-center justify-center transition-all ${menuActive ? 'bg-[#b4e033] text-[#0e1c0f]' : 'bg-[#1e3222] text-[#6b9165]'}`}>
              <IcoGrid cls="w-4 h-4" />
            </div>
            <span className={`text-[9px] font-medium leading-none ${menuActive ? 'text-[#b4e033]' : 'text-[#4a6b4a]'}`}>Menu</span>
          </button>
        )}

        {secondHalf.map(({ code, short, Icon, badge }) => (
          <button key={code} onClick={() => navigate(code)}
            className={`flex-1 flex flex-col items-center gap-1 py-2.5 transition-colors relative ${active === code ? 'text-[#b4e033]' : 'text-[#4a6b4a]'}`}>
            <div className={`w-10 h-7 rounded-full flex items-center justify-center transition-colors ${active === code ? 'bg-[#b4e033]/15' : ''}`}>
              <Icon />
              {badge !== undefined && active !== code && (
                <span className="absolute top-2 right-[calc(50%-20px)] w-4 h-4 flex items-center justify-center text-[9px] font-bold rounded-full bg-[#fbbf24] text-[#0e1c0f]">{badge}</span>
              )}
            </div>
            <span className="text-[9px] font-medium leading-none">{short}</span>
          </button>
        ))}
      </nav>

      {showMenu && overflowItems.length > 0 && (
        <div className="md:hidden fixed inset-0 z-30 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowMenu(false)} />
          <div className="relative bg-[#162419] rounded-t-3xl overflow-hidden max-h-[80vh] flex flex-col">
            <div className="w-10 h-1 bg-[#2a4230] rounded-full mx-auto mt-3 mb-1 shrink-0" />
            <div className="px-5 pt-3 pb-2 flex items-center justify-between shrink-0">
              <p className="text-[#edf5ea] font-semibold text-base">Menu</p>
              <button onClick={() => setShowMenu(false)} className="w-7 h-7 rounded-full bg-[#1e3222] flex items-center justify-center text-[#6b9165]">
                <IcoX cls="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="overflow-y-auto px-4 pb-8">
              {menuModules.length > 0 && (
                <>
                  <p className="text-[#3d5c44] text-xs font-medium uppercase tracking-wider px-1 mb-2 mt-1">Modules</p>
                  <div className="space-y-2 mb-4">
                    {menuModules.map((item) => <MenuItemButton key={item.code} item={item} active={active} onClick={() => navigate(item.code)} />)}
                  </div>
                </>
              )}
              {menuAdmin.length > 0 && (
                <>
                  <p className="text-[#3d5c44] text-xs font-medium uppercase tracking-wider px-1 mb-2">Administration</p>
                  <div className="space-y-2">
                    {menuAdmin.map((item) => <MenuItemButton key={item.code} item={item} active={active} onClick={() => navigate(item.code)} />)}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MenuItemButton({ item, active, onClick }: { item: NavItem; active: string; onClick: () => void }) {
  const { code, label, Icon, badge } = item;
  const isActive = active === code;
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl transition-all active:scale-[.98] ${isActive ? 'bg-[#b4e033] text-[#0e1c0f]' : 'bg-[#1e3222] text-[#edf5ea] border border-[#2a4230]'}`}>
      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isActive ? 'bg-[#0e1c0f]/15' : 'bg-[#2a4230]'}`}>
        <Icon />
      </div>
      <span className="flex-1 text-left font-medium text-sm">{label}</span>
      {badge !== undefined && (
        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${isActive ? 'bg-[#0e1c0f]/20 text-[#0e1c0f]' : 'bg-[#f87171]/20 text-[#f87171]'}`}>{badge}</span>
      )}
      <IcoChevR cls={`w-4 h-4 shrink-0 ${isActive ? 'text-[#0e1c0f]/50' : 'text-[#4a6b4a]'}`} />
    </button>
  );
}

export function AppShell({ active, onNav, nomEntreprise, nomUtilisateur, entrepriseId, isOnline, masquer, children }: {
  active: string; onNav: (code: string) => void; nomEntreprise: string; nomUtilisateur: string;
  entrepriseId: string | undefined; isOnline: boolean; masquer?: string[]; children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex bg-[#0e1c0f]">
      <Sidebar active={active} onNav={onNav} nomEntreprise={nomEntreprise} nomUtilisateur={nomUtilisateur} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar active={active} isOnline={isOnline} entrepriseId={entrepriseId} nomUtilisateur={nomUtilisateur} onNav={onNav} />
        <main className="flex-1 overflow-y-auto pb-28 md:pb-6">{children}</main>
      </div>
      <BottomNav active={active} onNav={onNav} masquer={masquer} />
    </div>
  );
}

export { PRIMARY_TABS, MENU_MODULES, MENU_ADMIN };
