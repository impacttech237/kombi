import { useEffect, useState } from 'react';
import { useSession, signOut } from './lib/auth.js';
import { listerEntreprises, type EntrepriseResume } from './lib/api.js';
import { Login } from './pages/Login.js';
import { Onboarding } from './pages/Onboarding.js';
import { Dashboard } from './pages/Dashboard.js';
import { Ecran, TopBar, BottomNav } from './components/Layout.js';
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

function Bientot({ titre }: { titre: string }) {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: 360, textAlign: 'center' }}>
      <div>
        <h2>{titre}</h2>
        <p className="muet">Ce module arrive très bientôt.</p>
      </div>
    </div>
  );
}

function Espace() {
  const [entreprises, setEntreprises] = useState<EntrepriseResume[] | null>(null);
  const [activeId] = useState<string | null>(() => localStorage.getItem('kombi.entreprise'));
  const [onglet, setOnglet] = useState('dashboard');

  function recharger() {
    return listerEntreprises().then(setEntreprises).catch(() => setEntreprises([]));
  }
  useEffect(() => { void recharger(); }, []);

  if (entreprises === null) return <Splash />;
  if (entreprises.length === 0)
    return <Onboarding onCree={() => { setEntreprises(null); void recharger(); }} />;

  const active = entreprises.find((e) => e.id === activeId) ?? entreprises[0]!;
  localStorage.setItem('kombi.entreprise', active.id);

  return (
    <Ecran nav={<BottomNav actif={onglet} onNaviguer={setOnglet} />}>
      <TopBar nomEntreprise={active.raison_sociale} onChangeEntreprise={() => setOnglet('dashboard')} />
      <div style={{ marginTop: 14 }}>
        {onglet === 'dashboard' ? <Dashboard entreprise={active} />
          : onglet === 'caisse' ? <Bientot titre="Caisse" />
          : onglet === 'stock' ? <Bientot titre="Stock" />
          : onglet === 'tiers' ? <Bientot titre="Clients & fournisseurs" />
          : <Bientot titre="Comptabilité" />}
      </div>
      <div style={{ textAlign: 'center', marginTop: 18 }}>
        <Bouton variante="ghost" onClick={() => { localStorage.removeItem('kombi.entreprise'); void signOut(); }}>
          Se déconnecter
        </Bouton>
      </div>
    </Ecran>
  );
}

export function App() {
  const { data: session, isPending } = useSession();
  if (isPending) return <Splash />;
  if (!session) return <Login />;
  return <Espace />;
}
