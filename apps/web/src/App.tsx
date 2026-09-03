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
import { Equipe } from './pages/Equipe.js';
import { Tiers } from './pages/Tiers.js';
import { Parametres } from './pages/Parametres.js';
import { Comptabilite } from './pages/Comptabilite.js';
import { AppShell } from './components/Shell.js';
import { OfflineBanner } from './components/OfflineBanner.js';
import { Bouton, Logo } from './components/ui.js';

function Splash() {
  return (
    <div className="center-ecran">
      <div style={{ display: 'grid', placeItems: 'center', gap: 12 }}>
        <Logo size={56} />
        <span className="muet">Chargement…</span>
      </div>
    </div>
  );
}

function Espace() {
  const { data: session } = useSession();
  const [entreprises, setEntreprises] = useState<EntrepriseResume[] | null>(null);
  const [activeId] = useState<string | null>(() => localStorage.getItem('kombi.entreprise'));
  const [onglet, setOnglet] = useState('dashboard');

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
    return <Onboarding onCree={() => { setEntreprises(null); void recharger(); }} />;

  const active = entreprises.find((e) => e.id === activeId) ?? entreprises[0]!;
  localStorage.setItem('kombi.entreprise', active.id);

  function deconnexion() {
    localStorage.removeItem('kombi.entreprise');
    localStorage.removeItem('kombi.entreprises');
    localStorage.removeItem('kombi.logged');
    void signOut();
    location.reload();
  }

  const role = active.role as RoleMembre;
  // Architecture de nav validée le 2026-09-03 (voir docs/parcours.md « Refonte design system ») :
  // 4 onglets fixes + feuille Menu (Modules/Administration). Dépenses/Créances/Dettes n'ont pas
  // encore d'entrée — elles rejoindront le flux de transactions de Trésorerie lors de son
  // portage ; en attendant, la rangée sous le contenu reste leur seul accès.
  const masquer = [
    ...(active.secteur === 'service' || !peut(role, 'stock:read') ? ['stock'] : []),
    ...(peut(role, 'compta:read') ? [] : ['compta', 'tresorerie']),
    ...(peut(role, 'vente:create') ? [] : ['caisse']),
    ...(peut(role, 'facture:read') ? [] : ['factures']),
    ...(peut(role, 'tiers:read') ? [] : ['tiers']),
    ...(peut(role, 'commande:read') ? [] : ['commandes']),
    ...(peut(role, 'membre:manage') ? [] : ['equipe']),
    ...(peut(role, 'entreprise:manage') ? [] : ['parametres']),
  ];
  const nomUtilisateur = session?.user?.name?.trim() || active.raison_sociale;

  return (
    <AppShell active={onglet} onNav={setOnglet} nomEntreprise={active.raison_sociale}
      nomUtilisateur={nomUtilisateur} entrepriseId={active.id} isOnline={navigator.onLine} masquer={masquer}>
      <div className="px-4 pt-4 md:px-8 md:pt-6">
        <OfflineBanner />
        {onglet === 'dashboard' ? <Dashboard entreprise={active} onCaisse={() => setOnglet('caisse')} onCommandes={() => setOnglet('commandes')} onDepenses={() => setOnglet('depenses')} onCreances={() => setOnglet('creances')} onDettes={() => setOnglet('dettes')} />
          : onglet === 'caisse' ? <Caisse entreprise={active} onHistorique={() => setOnglet('ventes')} />
          : onglet === 'ventes' ? <Ventes entreprise={active} role={role} onRetour={() => setOnglet('caisse')} />
          : onglet === 'stock' ? <Stock entreprise={active} />
          : onglet === 'factures' ? <Factures entreprise={active} />
          : onglet === 'commandes' ? <Commandes entreprise={active} onRetour={() => setOnglet('dashboard')} />
          : onglet === 'depenses' ? <Depenses entreprise={active} onRetour={() => setOnglet('dashboard')} />
          : onglet === 'creances' ? <Creances entreprise={active} onRetour={() => setOnglet('dashboard')} />
          : onglet === 'dettes' ? <Dettes entreprise={active} onRetour={() => setOnglet('dashboard')} />
          : onglet === 'equipe' ? <Equipe entreprise={active} onRetour={() => setOnglet('dashboard')} />
          : onglet === 'parametres' ? <Parametres entreprise={active} onRetour={() => setOnglet('dashboard')} />
          : onglet === 'tiers' ? <Tiers entreprise={active} onRetour={() => setOnglet('dashboard')} />
          // 'tresorerie' et 'compta' pointent temporairement vers le même écran : Trésorerie
          // n'est pas encore portée (voir docs/parcours.md « Refonte design system »).
          : <Comptabilite entreprise={active} />}

        {/* Temporaire : Dépenses/Créances/Dettes rejoindront Trésorerie (voir commentaire plus
            haut). Se déconnecter n'a pas encore de nouvel emplacement (profil ?). */}
        <div className="flex justify-center flex-wrap gap-2 mt-6 mb-24 md:mb-6">
          {peut(role, 'depense:read') && (
            <Bouton variante="ghost" onClick={() => setOnglet('depenses')}>Dépenses</Bouton>
          )}
          {peut(role, 'vente:read') && (
            <Bouton variante="ghost" onClick={() => setOnglet('creances')}>Créances</Bouton>
          )}
          {peut(role, 'achat:read') && (
            <Bouton variante="ghost" onClick={() => setOnglet('dettes')}>Dettes</Bouton>
          )}
          <Bouton variante="ghost" onClick={deconnexion}>Se déconnecter</Bouton>
        </div>
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
