import { useEffect, useState } from 'react';
import { formaterFCFA, TERMINOLOGIE, peut, type Secteur, type RoleMembre } from '@kombi/shared';
import {
  api, statsJour, tendance7Jours, listerCommandes, listerDepenses, listerVentesACredit,
  listerFacturesImpayees, listerDettesFournisseurs, margeCumulee, meilleuresVentes, depensesDuJour,
  listerProduits, type EntrepriseResume, type MeilleureVente,
} from '../lib/api.js';
import { Bouton, CarteStat, Icon } from '../components/ui.js';

interface IgsResp {
  caCumule: number;
  regime: string;
  igs: { igsAnnuel: number; classe: number } | null;
}

export function Dashboard({ entreprise, onCaisse, onCommandes, onDepenses, onCreances, onDettes }: {
  entreprise: EntrepriseResume; onCaisse?: () => void; onCommandes?: () => void; onDepenses?: () => void;
  onCreances?: () => void; onDettes?: () => void;
}) {
  const term = TERMINOLOGIE[(entreprise.secteur as Secteur) ?? 'commerce'];
  const [igs, setIgs] = useState<IgsResp | null>(null);
  const [jour, setJour] = useState<{ nbVentes: number; totalJour: number } | null>(null);
  const [nbCmd, setNbCmd] = useState<number | null>(null);
  const [totalDepenses, setTotalDepenses] = useState<number | null>(null);
  const [totalCreances, setTotalCreances] = useState<number | null>(null);
  const [totalDettes, setTotalDettes] = useState<number | null>(null);
  const [tendance, setTendance] = useState<{ jour: string; total: number }[] | null>(null);
  const [marge, setMarge] = useState<number | null>(null);
  const [top, setTop] = useState<MeilleureVente[] | null>(null);
  const [depensesJour, setDepensesJour] = useState<number | null>(null);
  const [alertesStock, setAlertesStock] = useState<number | null>(null);
  const [erreur, setErreur] = useState('');
  const role = entreprise.role as RoleMembre;
  const voitCompta = peut(role, 'compta:read');
  const voitDepenses = peut(role, 'depense:read');
  const voitCreances = peut(role, 'vente:read') || peut(role, 'facture:read');
  const voitDettes = peut(role, 'achat:read');
  const voitVentes = peut(role, 'vente:read');
  const voitStock = entreprise.secteur !== 'service' && peut(role, 'stock:read');

  useEffect(() => {
    if (voitCompta) {
      api<IgsResp>('/api/fiscalite/igs', { entrepriseId: entreprise.id })
        .then(setIgs)
        .catch((e) => setErreur(e instanceof Error ? e.message : 'Erreur'));
    }
    statsJour(entreprise.id).then(setJour).catch(() => {});
    tendance7Jours(entreprise.id).then(setTendance).catch(() => {});
    listerCommandes(entreprise.id)
      .then((cs) => setNbCmd(cs.filter((c) => c.statut === 'en_attente' || c.statut === 'en_cours').length))
      .catch(() => {});
    if (voitDepenses) {
      listerDepenses(entreprise.id)
        .then((ds) => setTotalDepenses(ds.reduce((s, d) => s + d.montant, 0)))
        .catch(() => {});
    }
    if (voitCreances) {
      Promise.all([
        listerVentesACredit(entreprise.id).catch(() => []),
        listerFacturesImpayees(entreprise.id).catch(() => []),
      ]).then(([ventes, factures]) => {
        setTotalCreances(
          ventes.reduce((s, v) => s + (v.total_ttc - v.regle), 0)
          + factures.reduce((s, f) => s + f.montantDu, 0),
        );
      });
    }
    if (voitDettes) {
      listerDettesFournisseurs(entreprise.id)
        .then((ds) => setTotalDettes(ds.reduce((s, d) => s + (d.total_ttc - d.regle), 0)))
        .catch(() => {});
    }
    if (voitCompta) margeCumulee(entreprise.id).then(setMarge).catch(() => {});
    if (voitVentes) meilleuresVentes(entreprise.id).then(setTop).catch(() => {});
    if (voitDepenses) depensesDuJour(entreprise.id).then(setDepensesJour).catch(() => {});
    if (voitStock) {
      listerProduits(entreprise.id)
        .then((ps) => setAlertesStock(ps.filter((p) => p.en_alerte === 1).length))
        .catch(() => {});
    }
  }, [entreprise.id, voitCompta, voitDepenses, voitCreances, voitDettes, voitVentes, voitStock]);

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
            <CarteStat titre="Marge brute" icone="graph"
              valeur={marge !== null ? formaterFCFA(marge) : '—'} delta="Exercice" positif />
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
        {voitDepenses && (
          <button onClick={onDepenses} style={{ all: 'unset', cursor: 'pointer' }}>
            <CarteStat titre="Dépenses du jour" icone="baisse"
              valeur={depensesJour !== null ? formaterFCFA(depensesJour) : '—'} delta="Aujourd'hui" positif={false} />
          </button>
        )}
        {voitStock && (
          <CarteStat titre="Alertes stock" icone="stock"
            valeur={alertesStock !== null ? String(alertesStock) : '—'}
            delta={alertesStock === 0 ? 'RAS' : 'à réapprovisionner'} positif={alertesStock === 0} />
        )}
        {voitCreances && (
          <button onClick={onCreances} style={{ all: 'unset', cursor: 'pointer' }}>
            <CarteStat titre="On me doit" icone="argent"
              valeur={totalCreances !== null ? formaterFCFA(totalCreances) : '—'} delta="à encaisser" positif />
          </button>
        )}
        {voitDettes && (
          <button onClick={onDettes} style={{ all: 'unset', cursor: 'pointer' }}>
            <CarteStat titre="Ce que je dois" icone="boite"
              valeur={totalDettes !== null ? formaterFCFA(totalDettes) : '—'} delta="à régler" positif={false} />
          </button>
        )}
      </div>

      <div className="carte" style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <strong>Ventes des 7 derniers jours</strong>
          <span className="chip chip-ok">{entreprise.regime_fiscal === 'igs' ? 'Régime IGS' : 'Régime réel'}</span>
        </div>
        {tendance === null ? <p className="muet" style={{ fontSize: 13 }}>Chargement…</p>
          : tendance.every((t) => t.total === 0) ? (
            <p className="muet" style={{ fontSize: 13, marginBottom: 0 }}>
              Enregistrez votre première vente pour voir vos statistiques s'animer.
            </p>
          ) : <GrapheTendance donnees={tendance} />}
      </div>

      {voitVentes && top !== null && top.length > 0 && (
        <div className="carte" style={{ marginTop: 14 }}>
          <strong style={{ display: 'block', marginBottom: 10 }}>Meilleures ventes</strong>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {top.map((t, i) => (
              <div key={t.designation} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="muet" style={{ fontSize: 13, width: 16 }}>{i + 1}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.designation}
                </span>
                <span className="muet" style={{ fontSize: 13 }}>×{t.quantite}</span>
                <span className="chiffre" style={{ fontWeight: 600, fontSize: 14 }}>{formaterFCFA(t.montant_ht)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {erreur && <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10 }}>{erreur}</p>}
    </>
  );
}

/** Vrai graphe (données réelles des 7 derniers jours), plus de décor statique. */
function GrapheTendance({ donnees }: { donnees: { jour: string; total: number }[] }) {
  const largeur = 300, hauteur = 110, pas = largeur / (donnees.length - 1 || 1);
  const max = Math.max(...donnees.map((d) => d.total), 1);
  const y = (v: number) => hauteur - 10 - (v / max) * (hauteur - 20);
  const points = donnees.map((d, i) => `${i * pas},${y(d.total)}`).join(' ');
  const libelleJour = (iso: string) =>
    new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');

  return (
    <div>
      <svg viewBox={`0 0 ${largeur} ${hauteur}`} style={{ width: '100%', height: hauteur }} aria-hidden>
        <polyline fill="none" stroke="var(--vert)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={points} />
        <polygon fill="var(--vert-clair)" opacity="0.6" points={`${points} ${largeur},${hauteur} 0,${hauteur}`} />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muet)', marginTop: 4 }}>
        {donnees.map((d) => <span key={d.jour}>{libelleJour(d.jour)}</span>)}
      </div>
    </div>
  );
}
