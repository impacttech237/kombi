import { useEffect, useState } from 'react';
import { formaterFCFA, TERMINOLOGIE, peut, type Secteur, type RoleMembre } from '@kombi/shared';
import { api, statsJour, listerCommandes, listerDepenses, type EntrepriseResume } from '../lib/api.js';
import { Bouton, CarteStat, Icon } from '../components/ui.js';

interface IgsResp {
  caCumule: number;
  regime: string;
  igs: { igsAnnuel: number; classe: number } | null;
}

export function Dashboard({ entreprise, onCaisse, onCommandes, onDepenses }: {
  entreprise: EntrepriseResume; onCaisse?: () => void; onCommandes?: () => void; onDepenses?: () => void;
}) {
  const term = TERMINOLOGIE[(entreprise.secteur as Secteur) ?? 'commerce'];
  const [igs, setIgs] = useState<IgsResp | null>(null);
  const [jour, setJour] = useState<{ nbVentes: number; totalJour: number } | null>(null);
  const [nbCmd, setNbCmd] = useState<number | null>(null);
  const [totalDepenses, setTotalDepenses] = useState<number | null>(null);
  const [erreur, setErreur] = useState('');
  const role = entreprise.role as RoleMembre;
  const voitCompta = peut(role, 'compta:read');
  const voitDepenses = peut(role, 'depense:read');

  useEffect(() => {
    if (voitCompta) {
      api<IgsResp>('/api/fiscalite/igs', { entrepriseId: entreprise.id })
        .then(setIgs)
        .catch((e) => setErreur(e instanceof Error ? e.message : 'Erreur'));
    }
    statsJour(entreprise.id).then(setJour).catch(() => {});
    listerCommandes(entreprise.id)
      .then((cs) => setNbCmd(cs.filter((c) => c.statut === 'en_attente' || c.statut === 'en_cours').length))
      .catch(() => {});
    if (voitDepenses) {
      listerDepenses(entreprise.id)
        .then((ds) => setTotalDepenses(ds.reduce((s, d) => s + d.montant, 0)))
        .catch(() => {});
    }
  }, [entreprise.id, voitCompta, voitDepenses]);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 2px 14px' }}>
        <div>
          <p className="muet" style={{ margin: 0, fontSize: 13 }}>Bonjour 👋</p>
          <h1 className="titre-page">Tableau de bord</h1>
        </div>
        <Bouton onClick={onCaisse}><Icon name="plus" size={18} /> Vente</Bouton>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {voitCompta && (
          <>
            <CarteStat titre="Chiffre d'affaires" icone="argent"
              valeur={igs ? formaterFCFA(igs.caCumule) : '—'} delta="Exercice" positif />
            <CarteStat titre="IGS estimé" icone="graph"
              valeur={igs?.igs ? formaterFCFA(igs.igs.igsAnnuel) : (igs ? 'Régime réel' : '—')}
              delta={igs?.igs ? `Classe ${igs.igs.classe}` : undefined} positif />
          </>
        )}
        <CarteStat titre="Ventes du jour" icone="caisse"
          valeur={jour ? formaterFCFA(jour.totalJour) : '—'}
          delta={jour ? `${jour.nbVentes} vente${jour.nbVentes > 1 ? 's' : ''}` : undefined} positif />
        <button onClick={onCommandes} style={{ all: 'unset', cursor: 'pointer' }}>
          <CarteStat titre={term.commandes[0]!.toUpperCase() + term.commandes.slice(1)} icone="boite"
            valeur={nbCmd !== null ? String(nbCmd) : '—'} delta="en cours" positif />
        </button>
        {voitDepenses && (
          <button onClick={onDepenses} style={{ all: 'unset', cursor: 'pointer' }}>
            <CarteStat titre="Dépenses" icone="baisse"
              valeur={totalDepenses !== null ? formaterFCFA(totalDepenses) : '—'} delta="Exercice" positif={false} />
          </button>
        )}
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
      <polyline fill="none" stroke="var(--vert)" strokeWidth="3" strokeLinecap="round"
        points="0,80 40,72 80,78 120,55 160,60 200,38 240,44 300,20" />
      <polygon fill="var(--vert-clair)" opacity="0.6"
        points="0,80 40,72 80,78 120,55 160,60 200,38 240,44 300,20 300,110 0,110" />
    </svg>
  );
}
