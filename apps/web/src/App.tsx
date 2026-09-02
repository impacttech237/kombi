import { useEffect, useState } from 'react';
import { useSession, signOut } from './lib/auth.js';
import { listerEntreprises, type EntrepriseResume } from './lib/api.js';
import { activerSyncAuto } from './offline/sync.js';
import { Login } from './pages/Login.js';
import { Onboarding } from './pages/Onboarding.js';
import { Dashboard } from './pages/Dashboard.js';
import { Caisse } from './pages/Caisse.js';
import { Stock } from './pages/Stock.js';
import { Factures } from './pages/Factures.js';
import { Commandes } from './pages/Commandes.js';
import { Comptabilite } from './pages/Comptabilite.js';
import { Ecran, TopBar, BottomNav } from './components/Layout.js';
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

  return (
    <Ecran nav={<BottomNav actif={onglet} onNaviguer={setOnglet}
      masquer={active.secteur === 'service' ? ['stock'] : []} />}>
      <TopBar nomEntreprise={active.raison_sociale} onChangeEntreprise={() => setOnglet('dashboard')} />
      <div style={{ marginTop: 14 }}>
        <OfflineBanner />
        {onglet === 'dashboard' ? <Dashboard entreprise={active} onCaisse={() => setOnglet('caisse')} onCommandes={() => setOnglet('commandes')} />
          : onglet === 'caisse' ? <Caisse entreprise={active} />
          : onglet === 'stock' ? <Stock entreprise={active} />
          : onglet === 'factures' ? <Factures entreprise={active} />
          : onglet === 'commandes' ? <Commandes entreprise={active} onRetour={() => setOnglet('dashboard')} />
          : <Comptabilite entreprise={active} />}
      </div>
      <div style={{ textAlign: 'center', marginTop: 18 }}>
        <Bouton variante="ghost" onClick={deconnexion}>Se déconnecter</Bouton>
      </div>
    </Ecran>
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
