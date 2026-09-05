import { useEffect, useState } from 'react';
import { peut, type RoleMembre } from '@kombi/shared';
import { useSession, signOut } from './lib/auth.js';
import { listerEntreprises, type EntrepriseResume } from './lib/api.js';
import { activerSyncAuto } from './offline/sync.js';
import { Login } from './pages/Login.js';
import { Onboarding } from './pages/Onboarding.js';
import { Dashboard } from './pages/Dashboard.js';
import { Caisse } from './pages/Caisse.js';
import { Ventes } from './pages/Ventes.js';
import { Stock } from './pages/Stock.js';
import { Factures } from './pages/Factures.js';
import { Commandes } from './pages/Commandes.js';
import { Depenses } from './pages/Depenses.js';
import { Creances } from './pages/Creances.js';
import { Dettes } from './pages/Dettes.js';
import { PiecesJustificatives } from './pages/PiecesJustificatives.js';
import { Rentabilite } from './pages/Rentabilite.js';
import { Rapports } from './pages/Rapports.js';
import { ADecider } from './pages/ADecider.js';
import { Equipe } from './pages/Equipe.js';
import { Tiers } from './pages/Tiers.js';
import { Parametres } from './pages/Parametres.js';
import { Comptabilite } from './pages/Comptabilite.js';
import { Tresorerie } from './pages/Tresorerie.js';
import { AppShell } from './components/Shell.js';
import { OfflineBanner } from './components/OfflineBanner.js';
import { Logo } from './components/ui.js';
import { IcoOk, IcoCart, IcoChevR, IcoBox, IcoFile, IcoUser, IcoWlt } from './components/icons.js';

/**
 * Bandeau de bienvenue affiché une fois à la place du Tableau de bord juste après la création
 * d'une entreprise — porté fidèlement du prototype Figma Make (WelcomeBanner(), lignes 3137-3191).
 */
function WelcomeBanner({ onNav }: { onNav: (m: string) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="bg-[#162419] rounded-2xl p-5 border border-[#b4e033]/20">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-[#b4e033] rounded-xl flex items-center justify-center text-[#0e1c0f]">
            <IcoOk cls="w-5 h-5" />
          </div>
          <div>
            <p className="text-[#edf5ea] font-semibold">Bienvenue dans Kombi !</p>
            <p className="text-[#4a6b4a] text-xs">Votre espace est prêt.</p>
          </div>
        </div>
        <p className="text-[#6b9165] text-sm leading-relaxed">
          Votre entreprise a bien été créée. Commencez par enregistrer vos premières ventes pour alimenter vos
          tableaux de bord.
        </p>
      </div>

      <button onClick={() => onNav('caisse')}
        className="w-full bg-[#162419] rounded-2xl p-5 text-left border border-[#2a4230] hover:border-[#b4e033]/30 active:scale-[0.99] transition-all">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#b4e033]/15 rounded-xl flex items-center justify-center text-[#b4e033] shrink-0">
            <IcoCart cls="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="text-[#edf5ea] font-semibold text-sm">Enregistrez votre première vente</p>
            <p className="text-[#6b9165] text-xs mt-0.5">Comptant ou à crédit, en espèces ou mobile money</p>
          </div>
          <IcoChevR cls="w-4 h-4 text-[#4a6b4a] shrink-0" />
        </div>
      </button>

      <div className="grid grid-cols-2 gap-3">
        {[
          { m: 'stock', Icon: IcoBox, title: 'Ajouter des produits', sub: 'Configurez votre catalogue' },
          { m: 'factures', Icon: IcoFile, title: 'Créer une facture', sub: 'Envoyez votre premier devis' },
          { m: 'tiers', Icon: IcoUser, title: 'Ajouter un client', sub: 'Gérez vos contacts' },
          { m: 'tresorerie', Icon: IcoWlt, title: 'Suivre la trésorerie', sub: 'Vos soldes en temps réel' },
        ].map(({ m, Icon, title, sub }) => (
          <button key={m} onClick={() => onNav(m)}
            className="bg-[#162419] rounded-2xl p-4 text-left border border-[#2a4230] hover:border-[#b4e033]/20 active:scale-[0.98] transition-all">
            <div className="w-9 h-9 bg-[#1e3222] rounded-xl flex items-center justify-center text-[#b4e033] mb-3">
              <Icon cls="w-4 h-4" />
            </div>
            <p className="text-[#edf5ea] text-xs font-semibold leading-snug">{title}</p>
            <p className="text-[#4a6b4a] text-[10px] mt-0.5 leading-snug">{sub}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function Splash() {
  return (
    <div className="min-h-screen bg-[#0e1c0f] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Logo size={56} />
        <span className="text-[#4a6b4a] text-sm">Chargement…</span>
      </div>
    </div>
  );
}

function Espace() {
  const { data: session } = useSession();
  const [entreprises, setEntreprises] = useState<EntrepriseResume[] | null>(null);
  const [activeId] = useState<string | null>(() => localStorage.getItem('kombi.entreprise'));
  const [onglet, setOnglet] = useState('dashboard');
  const [justCreated, setJustCreated] = useState(false);

  function recharger() {
    return listerEntreprises()
      .then((es) => { setEntreprises(es); localStorage.setItem('kombi.entreprises', JSON.stringify(es)); })
      .catch(() => {
        // Hors-ligne : on repart du cache pour rester utilisable.
        const cache = localStorage.getItem('kombi.entreprises');
        setEntreprises(cache ? (JSON.parse(cache) as EntrepriseResume[]) : []);
      });
  }
  useEffect(() => { void recharger(); }, []);

  if (entreprises === null) return <Splash />;
  if (entreprises.length === 0)
    return <Onboarding onCree={() => { setJustCreated(true); setEntreprises(null); void recharger(); }} />;

  const active = entreprises.find((e) => e.id === activeId) ?? entreprises[0]!;
  localStorage.setItem('kombi.entreprise', active.id);

  async function deconnexion() {
    localStorage.removeItem('kombi.entreprise');
    localStorage.removeItem('kombi.entreprises');
    localStorage.removeItem('kombi.logged');
    try { await signOut(); }
    finally { location.reload(); }
  }

  const role = active.role as RoleMembre;
  // Architecture de nav validée le 2026-09-03 (voir docs/parcours.md « Refonte design system ») :
  // 4 onglets fixes + feuille Menu (Modules/Finances/Administration) — voir components/Shell.tsx.
  const masquer = [
    ...(active.secteur === 'service' || !peut(role, 'stock:read') ? ['stock'] : []),
    ...(peut(role, 'compta:read') ? [] : ['compta', 'tresorerie']),
    ...(peut(role, 'vente:create') ? [] : ['caisse']),
    ...(peut(role, 'facture:read') ? [] : ['factures']),
    ...(peut(role, 'tiers:read') ? [] : ['tiers']),
    ...(peut(role, 'commande:read') ? [] : ['commandes']),
    ...(peut(role, 'membre:manage') ? [] : ['equipe']),
    ...(peut(role, 'entreprise:manage') ? [] : ['parametres']),
    ...(peut(role, 'depense:read') ? [] : ['depenses']),
    ...(peut(role, 'vente:read') ? [] : ['creances']),
    ...(peut(role, 'achat:read') ? [] : ['dettes']),
    ...(peut(role, 'compta:read') ? [] : ['pieces']),
    ...(peut(role, 'compta:read') ? [] : ['rentabilite']),
    ...(peut(role, 'rapport:read') ? [] : ['rapports']),
    ...(peut(role, 'decision:read') ? [] : ['a-decider']),
  ];
  const nomUtilisateur = session?.user?.name?.trim() || active.raison_sociale;

  return (
    <AppShell active={onglet} onNav={setOnglet} nomEntreprise={active.raison_sociale}
      nomUtilisateur={nomUtilisateur} entrepriseId={active.id} isOnline={navigator.onLine} masquer={masquer}
      onLogout={deconnexion}>
      <div>
        <OfflineBanner />
        {onglet === 'dashboard' && justCreated ? <WelcomeBanner onNav={(m) => { setJustCreated(false); setOnglet(m); }} />
          : onglet === 'dashboard' ? <Dashboard entreprise={active} nomUtilisateur={nomUtilisateur} onCaisse={() => setOnglet('caisse')} onNav={setOnglet} />
          : onglet === 'caisse' ? <Caisse entreprise={active} onHistorique={() => setOnglet('ventes')} />
          : onglet === 'ventes' ? <Ventes entreprise={active} role={role} onRetour={() => setOnglet('caisse')} />
          : onglet === 'stock' ? <Stock entreprise={active} />
          : onglet === 'factures' ? <Factures entreprise={active} />
          : onglet === 'commandes' ? <Commandes entreprise={active} role={role} onRetour={() => setOnglet('dashboard')} />
          : onglet === 'depenses' ? <Depenses entreprise={active} onRetour={() => setOnglet('dashboard')} />
          : onglet === 'creances' ? <Creances entreprise={active} onRetour={() => setOnglet('dashboard')} />
          : onglet === 'dettes' ? <Dettes entreprise={active} onRetour={() => setOnglet('dashboard')} />
          : onglet === 'pieces' ? <PiecesJustificatives entreprise={active} onRetour={() => setOnglet('dashboard')} />
          : onglet === 'rentabilite' ? <Rentabilite entreprise={active} onRetour={() => setOnglet('dashboard')} />
          : onglet === 'rapports' ? <Rapports entreprise={active} onRetour={() => setOnglet('dashboard')} />
          : onglet === 'a-decider' ? <ADecider entreprise={active} onRetour={() => setOnglet('dashboard')} onNav={setOnglet} />
          : onglet === 'equipe' ? <Equipe entreprise={active} onRetour={() => setOnglet('dashboard')} />
          : onglet === 'parametres' ? <Parametres entreprise={active} onRetour={() => setOnglet('dashboard')} />
          : onglet === 'tiers' ? <Tiers entreprise={active} onRetour={() => setOnglet('dashboard')} onNav={setOnglet} />
          : onglet === 'tresorerie'
            ? <Tresorerie entreprise={active} onCaisse={() => setOnglet('caisse')} onDepenses={() => setOnglet('depenses')} />
          : onglet === 'compta-budgets' ? <Comptabilite entreprise={active} vueInitiale="budgets" />
          : <Comptabilite entreprise={active} />}
      </div>
    </AppShell>
  );
}

export function App() {
  const { data: session, isPending } = useSession();
  const [pretInitial, setPretInitial] = useState(false);

  useEffect(() => { activerSyncAuto(); }, []);
  useEffect(() => { if (!isPending) setPretInitial(true); }, [isPending]);
  useEffect(() => { if (session) localStorage.setItem('kombi.logged', '1'); }, [session]);

  if (!pretInitial && isPending) return <Splash />;
  if (session) return <Espace />;
  // Démarrage hors-ligne : si l'utilisateur était connecté, on entre en mode dégradé (cache).
  if (!navigator.onLine && localStorage.getItem('kombi.logged') === '1') return <Espace />;
  return <Login />;
}
