import { useEffect, useState } from 'react';
import { formaterFCFA, peut, type RoleMembre } from '@kombi/shared';
import { etatsFinanciers, type EntrepriseResume, type EtatsFinanciers, type LigneEtat } from '../lib/api.js';
import { Icon } from '../components/ui.js';
import { Journal } from './Journal.js';

export function Comptabilite({ entreprise }: { entreprise: EntrepriseResume }) {
  const [etats, setEtats] = useState<EtatsFinanciers | null>(null);
  const [vue, setVue] = useState<'resultat' | 'bilan' | 'journal'>('resultat');
  const [erreur, setErreur] = useState('');
  const voitJournal = peut(entreprise.role as RoleMembre, 'audit:read');

  useEffect(() => {
    etatsFinanciers(entreprise.id).then(setEtats).catch((e) => setErreur(e instanceof Error ? e.message : 'Erreur'));
  }, [entreprise.id]);

  return (
    <div>
      <h1 className="titre-page" style={{ marginBottom: 4 }}>Comptabilité</h1>
      <p className="muet" style={{ marginTop: 0, fontSize: 14 }}>Générée automatiquement depuis vos opérations.</p>

      <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
        {(['resultat', 'bilan', ...(voitJournal ? ['journal'] as const : [])] as const).map((v) => (
          <button key={v} onClick={() => setVue(v)} className={`btn ${vue === v ? 'btn-primaire' : 'btn-clair'}`} style={{ flex: 1 }}>
            {v === 'resultat' ? 'Résultat' : v === 'bilan' ? 'Bilan' : 'Journal'}
          </button>
        ))}
      </div>

      {erreur && <p style={{ color: 'var(--danger)' }}>{erreur}</p>}
      {vue === 'journal' ? <Journal entreprise={entreprise} />
        : !etats ? <p className="muet">Chargement…</p>
        : vue === 'resultat' ? <Resultat e={etats} /> : <Bilan e={etats} />}
    </div>
  );
}

function Resultat({ e }: { e: EtatsFinanciers }) {
  const r = e.resultat;
  const positif = r.resultat >= 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="carte" style={{ textAlign: 'center' }}>
        <div className="muet" style={{ fontSize: 13 }}>Résultat de l'exercice</div>
        <div className="chiffre" style={{ fontSize: 34, fontWeight: 700, color: positif ? 'var(--vert)' : 'var(--danger)' }}>
          {positif ? '' : '−'}{formaterFCFA(Math.abs(r.resultat)).replace('-', '')}
        </div>
        <span className={`chip ${positif ? 'chip-ok' : 'chip-bas'}`}>{positif ? 'Bénéfice' : 'Perte'}</span>
      </div>
      <Section titre="Produits" total={r.produits} lignes={r.detailProduits} couleur="var(--vert)" />
      <Section titre="Charges" total={r.charges} lignes={r.detailCharges} couleur="var(--danger)" />
    </div>
  );
}

function Bilan({ e }: { e: EtatsFinanciers }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="carte" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600 }}>Équilibre du bilan</span>
        <span className={`chip ${e.bilan.equilibre ? 'chip-ok' : 'chip-bas'}`}>
          <Icon name={e.bilan.equilibre ? 'check' : 'baisse'} size={13} /> {e.bilan.equilibre ? 'Équilibré' : 'Écart'}
        </span>
      </div>
      <Section titre="Actif (ce que possède l'entreprise)" total={e.bilan.totalActif} lignes={e.bilan.actif} couleur="var(--vert)" />
      <Section titre="Passif (ressources et dettes)" total={e.bilan.totalPassif} lignes={e.bilan.passif} couleur="var(--vert-fonce)" />
    </div>
  );
}

function Section({ titre, total, lignes, couleur }: { titre: string; total: number; lignes: LigneEtat[]; couleur: string }) {
  return (
    <div className="carte">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: lignes.length ? 10 : 0 }}>
        <strong>{titre}</strong>
        <span className="chiffre" style={{ fontWeight: 700, color: couleur }}>{formaterFCFA(total)}</span>
      </div>
      {lignes.map((l, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 14 }}>
          <span className="muet">{l.numero} · {l.libelle}</span>
          <span className="chiffre">{formaterFCFA(l.montant)}</span>
        </div>
      ))}
    </div>
  );
}
