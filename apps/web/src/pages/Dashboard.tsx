import { useEffect, useState } from 'react';
import { formaterFCFA } from '@kombi/shared';
import { api, type EntrepriseResume } from '../lib/api.js';
import { Bouton, CarteStat, Icon } from '../components/ui.js';

interface IgsResp {
  caCumule: number;
  regime: string;
  igs: { igsAnnuel: number; classe: number } | null;
}

export function Dashboard({ entreprise }: { entreprise: EntrepriseResume }) {
  const [igs, setIgs] = useState<IgsResp | null>(null);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    api<IgsResp>('/api/fiscalite/igs', { entrepriseId: entreprise.id })
      .then(setIgs)
      .catch((e) => setErreur(e instanceof Error ? e.message : 'Erreur'));
  }, [entreprise.id]);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 2px 14px' }}>
        <div>
          <p className="muet" style={{ margin: 0, fontSize: 13 }}>Bonjour 👋</p>
          <h1 className="titre-page">Tableau de bord</h1>
        </div>
        <Bouton><Icon name="plus" size={18} /> Vente</Bouton>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <CarteStat titre="Chiffre d'affaires" icone="argent"
          valeur={igs ? formaterFCFA(igs.caCumule) : '—'} delta="Exercice" positif />
        <CarteStat titre="IGS estimé" icone="graph"
          valeur={igs?.igs ? formaterFCFA(igs.igs.igsAnnuel) : (igs ? 'Régime réel' : '—')}
          delta={igs?.igs ? `Classe ${igs.igs.classe}` : undefined} positif />
        <CarteStat titre="Ventes du jour" icone="caisse" valeur="0" delta="0 aujourd'hui" positif />
        <CarteStat titre="Commandes" icone="boite" valeur="0" delta="en cours" positif />
      </div>

      <div className="carte" style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <strong>Activité</strong>
          <span className="chip chip-ok">{entreprise.regime_fiscal === 'igs' ? 'Régime IGS' : 'Régime réel'}</span>
        </div>
        <FauxGraphe />
        <p className="muet" style={{ fontSize: 13, marginBottom: 0 }}>
          Enregistrez votre première vente pour voir vos statistiques s'animer.
        </p>
      </div>

      {erreur && <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10 }}>{erreur}</p>}
    </>
  );
}

function FauxGraphe() {
  return (
    <svg viewBox="0 0 300 110" style={{ width: '100%', height: 110 }} aria-hidden>
      <polyline fill="none" stroke="var(--lime)" strokeWidth="3" strokeLinecap="round"
        points="0,80 40,72 80,78 120,55 160,60 200,38 240,44 300,20" />
      <polygon fill="var(--vert-clair)" opacity="0.6"
        points="0,80 40,72 80,78 120,55 160,60 200,38 240,44 300,20 300,110 0,110" />
    </svg>
  );
}
